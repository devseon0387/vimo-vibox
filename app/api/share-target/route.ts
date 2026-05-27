import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import { getStorageRoot } from "@/lib/fs/storage";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Web Share Target endpoint.
// 모바일 OS 공유 시트가 보낸 multipart/form-data 를 받아
// STORAGE_ROOT/_shares/<sessionId>/ 에 임시 저장 후 /my/box?sharedFiles=<sessionId> 로 redirect.
// proxy.ts matcher 에서 제외되어 있어 본 라우트가 직접 세션 검증 (chunk upload 와 동일).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// formData() 는 메모리 버퍼링 — share sheet 인입 단일 파일 상한.
// 큰 영상은 share 가 아닌 정식 업로드 UI 로.
const MAX_FILE_SIZE = 256 * 1024 * 1024;

function safeFilename(name: string, fallback: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 200);
  return cleaned || fallback;
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login?returnTo=/my/box", req.url), 303);
  }

  const ip = getClientIp(req);
  const rl = rateLimit(`share-target:${session.sub}:${ip}`, {
    max: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart" }, { status: 400 });
  }

  const sessionId = randomUUID();
  const baseDir = path.join(getStorageRoot(), "_shares", sessionId);
  await fs.mkdir(baseDir, { recursive: true });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  let savedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || file.size === 0) continue;
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: too large (${file.size}B > ${MAX_FILE_SIZE}B)`);
      continue;
    }
    const name = safeFilename(file.name, `shared-${Date.now()}-${i}`);
    const outAbs = path.join(baseDir, name);
    try {
      const ws = createWriteStream(outAbs);
      await pipeline(Readable.fromWeb(file.stream() as never), ws);
      savedCount++;
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }

  const title = form.get("title");
  const text = form.get("text");
  const url = form.get("url");
  const hasMeta =
    (typeof title === "string" && title.length > 0) ||
    (typeof text === "string" && text.length > 0) ||
    (typeof url === "string" && url.length > 0);
  if (hasMeta) {
    await fs.writeFile(
      path.join(baseDir, "_meta.json"),
      JSON.stringify({ title, text, url, errors }, null, 2),
    );
  }

  if (savedCount === 0 && !hasMeta) {
    await fs.rm(baseDir, { recursive: true, force: true });
    return NextResponse.redirect(new URL("/my/box?shareEmpty=1", req.url), 303);
  }

  return NextResponse.redirect(
    new URL(`/my/box?sharedFiles=${sessionId}`, req.url),
    303,
  );
}
