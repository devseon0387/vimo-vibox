import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import {
  finalizeChunkUpload,
  getChunkSession,
  abortChunkUpload,
  dedupeHardlink,
} from "@/lib/fs/storage";
import { and, eq, ne } from "drizzle-orm";
import { generateThumbInBackground, isVideoPath } from "@/lib/fs/thumbnail";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";
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

    // dedup(콘텐츠 주소): 같은 내용(SHA256+크기)이 이미 있으면, 방금 저장본을 그 물리 데이터에
    // 하드링크로 연결 → 디스크 1벌만. 사용자 파일은 그대로(읽으면 동일 바이트). 실패해도 원본 유지(무해).
    let dedupedWith: string | null = null;
    try {
      const dup = await db
        .select({ path: fileUploads.path })
        .from(fileUploads)
        .where(
          and(
            eq(fileUploads.contentHash, saved.contentHash),
            eq(fileUploads.fileSize, saved.size),
            ne(fileUploads.path, saved.path),
          ),
        )
        .limit(1);
      if (dup.length > 0) {
        const r = await dedupeHardlink(saved.path, dup[0].path);
        if (r.deduped) {
          dedupedWith = dup[0].path;
          console.log(
            `[dedup] hardlinked path=${saved.path} src=${dup[0].path} reclaimed=${r.bytes}B`,
          );
        }
      }
    } catch (e) {
      console.warn(
        `[WARN][upload/complete] dedup check failed path=${saved.path}: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }

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
          contentHash: saved.contentHash,
          fileSize: saved.size,
          episodeId: meta.episodeId ?? null,
          projectId: meta.projectId ?? null,
          partnerId: meta.partnerId ?? null,
        })
        .onConflictDoUpdate({
          target: fileUploads.path,
          set: {
            uploadedBy: session.sub,
            uploadedByName: session.name ?? session.username,
            uploadedAt: new Date(),
            contentHash: saved.contentHash,
            fileSize: saved.size,
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
      {
        ok: true,
        saved,
        ...(dbWarning ? { _warning: dbWarning } : {}),
        ...(dedupedWith ? { _deduped: dedupedWith } : {}),
      },
      { headers: cors },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500, headers: cors });
  }
}

export const runtime = "nodejs";
