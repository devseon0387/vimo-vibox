import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  finalizeChunkUpload,
  getChunkSession,
  abortChunkUpload,
} from "@/lib/fs/storage";

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
    return Response.json({ ok: true, saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
