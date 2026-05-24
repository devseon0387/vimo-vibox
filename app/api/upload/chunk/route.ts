import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { getCurrentSession } from "@/lib/auth/session";
import { getChunkPath, getChunkSession } from "@/lib/fs/storage";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

  // 청크 endpoint rate limit (단일 사용자 분당 1500청크 = 약 95MB×1500 = 142GB/min 이론치)
  // 정상 동시 24병렬 업로드 트래픽은 안전하게 통과.
  const ip = getClientIp(req);
  const rl = rateLimit(`upload-chunk:${session.sub}:${ip}`, {
    max: 1500,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { ...cors, "Retry-After": String(rl.retryAfterSec) } },
    );
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

  // Content-Length 사전 검증 — 클라이언트가 큰 청크 자기 신고 시 디스크 가드
  const contentLengthHeader = req.headers.get("content-length");
  const expectedSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;
  // 단일 청크 상한 200MB (정상 95MB 청크 여유분)
  const MAX_CHUNK_BYTES = 200 * 1024 * 1024;
  if (Number.isFinite(expectedSize) && expectedSize > MAX_CHUNK_BYTES) {
    return Response.json({ error: "chunk too large" }, { status: 413, headers: cors });
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

  // 무결성 검증: 기록된 size가 Content-Length와 일치하는지
  // (네트워크 중간 truncation, 클라 abort 후 부분 write 등 잡힘)
  if (Number.isFinite(expectedSize)) {
    try {
      const s = await stat(targetPath);
      if (s.size !== expectedSize) {
        // 부분 write를 part로 두지 않음 — 다음 retry로 깨끗하게
        try {
          const fs = await import("node:fs/promises");
          await fs.unlink(targetPath);
        } catch {}
        return Response.json(
          { error: `chunk size mismatch: expected ${expectedSize}, got ${s.size}` },
          { status: 400, headers: cors },
        );
      }
    } catch {
      /* stat 실패 시 통과 — finalize의 total-size 체크가 잡아냄 */
    }
  }

  return Response.json({ ok: true }, { headers: cors });
}

export const runtime = "nodejs";
