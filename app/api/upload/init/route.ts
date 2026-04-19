import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { initChunkSession } from "@/lib/fs/storage";

// POST /api/upload/init
// body: { fileId, filename, totalSize, totalChunks, path }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  const { fileId, filename, totalSize, totalChunks, path: targetPath } = body as {
    fileId?: string;
    filename?: string;
    totalSize?: number;
    totalChunks?: number;
    path?: string;
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
    return Response.json({ error: "invalid params" }, { status: 400 });
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
    });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 400 });
  }
}

export const runtime = "nodejs";
