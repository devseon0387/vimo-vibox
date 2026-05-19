import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import {
  getZoneRoot,
  initChunkSession,
  parseZoneFromPath,
  personalOwnerOf,
} from "@/lib/fs/storage";

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

// POST /api/upload/init
// body: { fileId, filename, totalSize, totalChunks, path }
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
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

  if (
    !fileId ||
    typeof fileId !== "string" ||
    !/^[a-f0-9-]{30,}$/i.test(fileId) ||
    !filename ||
    typeof filename !== "string" ||
    typeof totalSize !== "number" ||
    totalSize <= 0 ||
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
    const used = await dirSize(userDir);
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
