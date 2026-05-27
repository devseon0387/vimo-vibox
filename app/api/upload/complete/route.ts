import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import {
  finalizeChunkUpload,
  getChunkSession,
  abortChunkUpload,
} from "@/lib/fs/storage";
import { generateThumbInBackground, isVideoPath } from "@/lib/fs/thumbnail";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { logTraffic } from "@/lib/traffic";
import { enqueue as enqueueHLS } from "@/lib/encoding/queue";
import { invalidateDirSizeCache } from "../init/route";
import { personalOwnerOf } from "@/lib/fs/storage";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

// POST /api/upload/complete  body: { fileId, action?: "complete" | "abort" }
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }

  const body = await req.json().catch(() => null);
  const fileId = body?.fileId;
  const action = body?.action ?? "complete";

  if (!fileId || !/^[a-f0-9-]{30,}$/i.test(fileId)) {
    return Response.json({ error: "invalid fileId" }, { status: 400, headers: cors });
  }

  const meta = await getChunkSession(fileId);
  if (!meta) {
    return Response.json({ error: "unknown session" }, { status: 404, headers: cors });
  }
  if (meta.userId !== session.sub) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: cors });
  }

  if (action === "abort") {
    await abortChunkUpload(fileId);
    return Response.json({ ok: true, aborted: true }, { headers: cors });
  }

  try {
    const saved = await finalizeChunkUpload(fileId);

    // 파일 소유권 DB 기록 (partner 가시성 + ERP 연동 추적용) — upsert.
    // 실패 시 응답에 _warning 필드로 명시 — 클라이언트 UI 가 노출, 서버 stderr 에 WARN
    // 표식 로깅으로 운영 모니터링 가능. 파일은 디스크에 그대로 두어 reconcile.ts 로 복구.
    let dbWarning: string | null = null;
    try {
      await db
        .insert(fileUploads)
        .values({
          path: saved.path,
          uploadedBy: session.sub,
          uploadedByName: session.name ?? session.username,
          episodeId: meta.episodeId ?? null,
          projectId: meta.projectId ?? null,
          partnerId: meta.partnerId ?? null,
        })
        .onConflictDoUpdate({
          target: fileUploads.path,
          set: {
            uploadedBy: session.sub,
            uploadedByName: session.name ?? session.username,
            uploadedAt: sql`(unixepoch() * 1000)`,
            episodeId: meta.episodeId ?? null,
            projectId: meta.projectId ?? null,
            partnerId: meta.partnerId ?? null,
          },
        });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      dbWarning = `fileUploads upsert failed: ${msg.slice(0, 200)}`;
      console.warn(
        `[WARN][upload/complete] fileUploads upsert failed user=${session.sub} path=${saved.path} err=${msg}`,
      );
    }

    const ownerId = personalOwnerOf(saved.path);
    if (ownerId) invalidateDirSizeCache(ownerId);
    logTraffic({
      path: saved.path,
      bytes: saved.size,
      source: "upload",
      userId: session.sub,
    });
    if (isVideoPath(saved.path)) {
      generateThumbInBackground(saved.path);
      enqueueHLS(saved.path).catch(() => {
        /* 큐 등록 실패는 응답 막지 않음 */
      });
    }

    return Response.json(
      dbWarning ? { ok: true, saved, _warning: dbWarning } : { ok: true, saved },
      { headers: cors },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500, headers: cors });
  }
}

export const runtime = "nodejs";
