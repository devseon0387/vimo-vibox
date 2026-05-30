import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import {
  absFromNotePath,
  reindexNote,
  recordVersion,
  lastVersionAt,
} from "@/lib/notes-index";

export const runtime = "nodejs";

const VERSION_GAP_MS = 5 * 60 * 1000;
const VERSION_DIFF_BYTES = 200;

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

type SaveBody = {
  path: string;        // '/notes/일기/2026-05-24.md'
  body: string;        // 마크다운 본문 (frontmatter 미포함)
  meta?: Record<string, unknown>;
  ifMatch?: number;    // 기대 mtimeMs (생략 시 충돌 검사 skip)
  manual?: boolean;    // Cmd+S 강제 저장이면 버전 무조건 기록
};

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;
  const session = g.session;

  const body = (await req.json().catch(() => null)) as SaveBody | null;
  if (!body || !body.path || typeof body.body !== "string") {
    return Response.json({ error: "path, body required" }, { status: 400, headers: cors });
  }
  if (!body.path.startsWith("/notes/") || !body.path.endsWith(".md")) {
    return Response.json({ error: "invalid path" }, { status: 400, headers: cors });
  }

  const abs = absFromNotePath(body.path);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400, headers: cors });

  // ETag 검사 — 현재 파일 mtime vs ifMatch
  let currentMtimeMs: number | null = null;
  let currentBody: string | null = null;
  try {
    const stat = await fs.stat(abs);
    currentMtimeMs = Math.floor(stat.mtimeMs);
    if (typeof body.ifMatch === "number" && currentMtimeMs !== body.ifMatch) {
      const raw = await fs.readFile(abs, "utf-8");
      const parsed = matter(raw);
      currentBody = parsed.content;
      return Response.json(
        {
          error: "conflict",
          serverMtimeMs: currentMtimeMs,
          serverBody: currentBody,
        },
        { status: 409, headers: cors },
      );
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      return Response.json({ error: err.message }, { status: 500, headers: cors });
    }
    // 신규 파일이면 ifMatch는 의미 X
  }

  // frontmatter + body 직렬화
  const meta = body.meta ?? {};
  const fileContent = matter.stringify(body.body, meta);

  // 디렉터리 보장
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, fileContent, "utf-8");

  // 인덱스 갱신
  const idx = await reindexNote(body.path);
  const newMtimeMs = idx.ok ? idx.mtimeMs : Math.floor((await fs.stat(abs)).mtimeMs);

  // 버전 기록 — 조건: manual=true OR 마지막 버전과 5분+200바이트 이상 차이
  const shouldVersion = await shouldRecordVersion(body.path, body.body, body.manual);
  if (shouldVersion) {
    await recordVersion({
      path: body.path,
      body: body.body,
      savedBy: session.sub,
      reason: body.manual ? "manual" : "autosave",
    });
  }

  return Response.json({ ok: true, mtimeMs: newMtimeMs }, { headers: cors });
}

async function shouldRecordVersion(
  notePath: string,
  body: string,
  manual: boolean | undefined,
): Promise<boolean> {
  if (manual) return true;
  const lastAt = await lastVersionAt(notePath);
  if (!lastAt) return true;
  if (Date.now() - lastAt < VERSION_GAP_MS) return false;
  // 시간 조건 통과 — 본문 변경량 체크는 단순화 (직전 버전 본문 비교는 비싸므로 시간 조건만으로)
  if (Buffer.byteLength(body, "utf-8") < VERSION_DIFF_BYTES) return false;
  return true;
}
