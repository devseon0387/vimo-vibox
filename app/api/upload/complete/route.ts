import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
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

// POST /api/upload/complete  body: { fileId, action?: "complete" | "abort" }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const fileId = body?.fileId;
  const action = body?.action ?? "complete";

  if (!fileId || !/^[a-f0-9-]{30,}$/i.test(fileId)) {
    return Response.json({ error: "invalid fileId" }, { status: 400 });
  }

  const meta = await getChunkSession(fileId);
  if (!meta) {
    return Response.json({ error: "unknown session" }, { status: 404 });
  }
  if (meta.userId !== session.sub) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (action === "abort") {
    await abortChunkUpload(fileId);
    return Response.json({ ok: true, aborted: true });
  }

  try {
    const saved = await finalizeChunkUpload(fileId);
    // 파일 소유권 DB 기록 (partner 가시성 용도) — upsert
    await db
      .insert(fileUploads)
      .values({
        path: saved.path,
        uploadedBy: session.sub,
        uploadedByName: session.name ?? session.username,
      })
      .onConflictDoUpdate({
        target: fileUploads.path,
        set: {
          uploadedBy: session.sub,
          uploadedByName: session.name ?? session.username,
          uploadedAt: sql`(unixepoch() * 1000)`,
        },
      })
      .catch(() => {});
    // 인바운드 트래픽 기록 (업로드된 파일 크기)
    logTraffic({
      path: saved.path,
      bytes: saved.size,
      source: "upload",
      userId: session.sub,
    });
    // 영상이면 백그라운드로 썸네일 생성 (응답 지연 안 됨)
    if (isVideoPath(saved.path)) {
      generateThumbInBackground(saved.path);
    }
    return Response.json({ ok: true, saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
