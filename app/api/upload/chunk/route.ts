import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { getCurrentSession } from "@/lib/auth/session";
import { getChunkPath, getChunkSession } from "@/lib/fs/storage";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

// POST /api/upload/chunk?fileId=xxx&index=N
// body: raw bytes of the chunk
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }

  const fileId = req.nextUrl.searchParams.get("fileId");
  const indexStr = req.nextUrl.searchParams.get("index");

  if (
    !fileId ||
    !/^[a-f0-9-]{30,}$/i.test(fileId) ||
    !indexStr ||
    !/^\d+$/.test(indexStr)
  ) {
    return Response.json({ error: "invalid params" }, { status: 400, headers: cors });
  }

  const index = parseInt(indexStr, 10);

  const meta = await getChunkSession(fileId);
  if (!meta) {
    return Response.json({ error: "unknown upload session" }, { status: 404, headers: cors });
  }
  if (meta.userId !== session.sub) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: cors });
  }
  if (index < 0 || index >= meta.totalChunks) {
    return Response.json({ error: "index out of range" }, { status: 400, headers: cors });
  }
  if (!req.body) {
    return Response.json({ error: "no body" }, { status: 400, headers: cors });
  }

  const targetPath = getChunkPath(fileId, index);
  let writeStream: ReturnType<typeof createWriteStream> | undefined;
  try {
    // 기존 부분파일 제거 (재시도 안전)
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(targetPath);
    } catch {
      /* 파일 없으면 무시 */
    }

    writeStream = createWriteStream(targetPath);
    const nodeStream = Readable.fromWeb(
      req.body as unknown as import("node:stream/web").ReadableStream,
    );
    await pipeline(nodeStream, writeStream);
  } catch (e: unknown) {
    try {
      writeStream?.destroy();
    } catch {
      /* noop */
    }
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500, headers: cors });
  }

  return Response.json({ ok: true }, { headers: cors });
}

export const runtime = "nodejs";
