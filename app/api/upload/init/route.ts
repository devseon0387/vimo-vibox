import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { statfs } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  getStorageRoot,
  getZoneRoot,
  initChunkSession,
  parseZoneFromPath,
  personalOwnerOf,
} from "@/lib/fs/storage";

// dirSize 캐시: userId → { bytes, expiresAt }. TTL 30초.
// 동시 다발 init 시 매 호출 풀워크 폭증 방지.
const dirSizeCache = new Map<string, { bytes: number; expiresAt: number }>();
const DIR_SIZE_TTL_MS = 30_000;

// 글로벌 disk-full 가드: 가용 공간이 이 임계 이하면 init 거부 (운영 다른 LaunchDaemon 보호)
const DISK_FULL_RESERVE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isFile()) total += (await fs.stat(full)).size;
      else if (e.isDirectory()) total += await dirSize(full);
    } catch {}
  }
  return total;
}

async function cachedDirSize(userId: string, dir: string): Promise<number> {
  const now = Date.now();
  const c = dirSizeCache.get(userId);
  if (c && c.expiresAt > now) return c.bytes;
  const bytes = await dirSize(dir);
  dirSizeCache.set(userId, { bytes, expiresAt: now + DIR_SIZE_TTL_MS });
  return bytes;
}

export function invalidateDirSizeCache(userId: string) {
  dirSizeCache.delete(userId);
}

// POST /api/upload/init
// body: { fileId, filename, totalSize, totalChunks, path }
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }

  // 인증 사용자 IP 기반 rate limit (디스크 풀 DoS 방지)
  const ip = getClientIp(req);
  const rl = rateLimit(`upload-init:${session.sub}:${ip}`, {
    max: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return Response.json(
      { error: "rate limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...cors, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // 글로벌 디스크 가용 공간 가드 — 인코딩·litestream·mirror 등 다른 워커 보호
  try {
    const stats = await statfs(getStorageRoot());
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < DISK_FULL_RESERVE_BYTES) {
      return Response.json(
        { error: "server disk full — upload temporarily unavailable", freeBytes },
        { status: 507, headers: cors },
      );
    }
  } catch {
    /* statfs 실패는 보수적으로 통과 */
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400, headers: cors });

  const {
    fileId,
    filename,
    totalSize,
    totalChunks,
    path: targetPath,
    conflictMode,
    episodeId,
    projectId,
    partnerId,
  } = body as {
    fileId?: string;
    filename?: string;
    totalSize?: number;
    totalChunks?: number;
    path?: string;
    conflictMode?: "overwrite" | "autonumber" | "skip";
    episodeId?: string;
    projectId?: string;
    partnerId?: string;
  };

  // 단일 파일 상한 (전 zone 공통): 200GB. 더 큰 파일은 사전 협의 + env로 풀기
  const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES ?? 200 * 1024 * 1024 * 1024);
  if (
    !fileId ||
    typeof fileId !== "string" ||
    !/^[a-f0-9-]{30,}$/i.test(fileId) ||
    !filename ||
    typeof filename !== "string" ||
    typeof totalSize !== "number" ||
    totalSize <= 0 ||
    totalSize > MAX_FILE_BYTES ||
    typeof totalChunks !== "number" ||
    totalChunks <= 0 ||
    totalChunks > 100000 ||
    !targetPath ||
    typeof targetPath !== "string"
  ) {
    return Response.json({ error: "invalid params" }, { status: 400, headers: cors });
  }

  // 시스템 예약 경로 차단 (_storage, .vibox, .. 등)
  const normalized = targetPath.startsWith("/") ? targetPath : "/" + targetPath;
  if (/(^|\/)(_|\.vibox|\.\.)/.test(normalized)) {
    return Response.json(
      { error: "reserved path not allowed" },
      { status: 403, headers: cors },
    );
  }

  // zone별 쓰기 권한 체크
  const { zone } = parseZoneFromPath(normalized);
  if (zone === "library") {
    // 자료실은 staff 만 업로드
    if (session.role !== "admin" && session.role !== "member") {
      return Response.json(
        { error: "library upload requires staff role" },
        { status: 403, headers: cors },
      );
    }
  } else if (zone === "personal") {
    // /personal/{userId}/... — 본인 ID만 허용 (admin 은 모든 유저 대리 업로드 가능)
    const ownerId = personalOwnerOf(normalized);
    if (!ownerId) {
      return Response.json(
        { error: "personal path requires /personal/{userId}/..." },
        { status: 400, headers: cors },
      );
    }
    if (session.role !== "admin" && ownerId !== session.sub) {
      return Response.json(
        { error: "cannot upload to another user's personal drive" },
        { status: 403, headers: cors },
      );
    }

    // 쿼타 체크: 본인 personal 현재 사용량 + 신규 파일이 users.quota_gb 초과하면 거부
    const [u] = await db
      .select({ quotaGb: users.quotaGb })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    const quotaBytes = (u?.quotaGb ?? 100) * 1024 * 1024 * 1024;
    const personalRoot = getZoneRoot("personal");
    const userDir = path.join(personalRoot, ownerId);
    const used = await cachedDirSize(ownerId, userDir);
    if (used + totalSize > quotaBytes) {
      return Response.json(
        {
          error: "quota exceeded",
          usedBytes: used,
          quotaBytes,
          requestBytes: totalSize,
        },
        { status: 413, headers: cors },
      );
    }
  }

  try {
    await initChunkSession({
      fileId,
      filename,
      totalSize,
      totalChunks,
      targetPath,
      userId: session.sub,
      createdAt: Date.now(),
      conflictMode:
        conflictMode === "overwrite" ||
        conflictMode === "autonumber" ||
        conflictMode === "skip"
          ? conflictMode
          : undefined,
      episodeId: typeof episodeId === "string" && episodeId ? episodeId : undefined,
      projectId: typeof projectId === "string" && projectId ? projectId : undefined,
      partnerId: typeof partnerId === "string" && partnerId ? partnerId : undefined,
    });
    return Response.json({ ok: true }, { headers: cors });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 400, headers: cors });
  }
}

export const runtime = "nodejs";
