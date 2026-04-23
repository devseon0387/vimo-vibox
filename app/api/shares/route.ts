import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { statPath } from "@/lib/fs/storage";

function generateToken() {
  return randomBytes(16).toString("base64url");
}

// GET /api/shares → 내가 만든 공유 링크 목록
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.createdBy, session.sub))
    .orderBy(desc(shareLinks.createdAt));

  return NextResponse.json({
    shares: rows.map((r) => ({
      id: r.id,
      token: r.token,
      filePath: r.filePath,
      title: r.title,
      paths: r.paths ? (JSON.parse(r.paths) as string[]) : [r.filePath],
      mode: r.mode,
      allowComments: r.allowComments,
      allowDownload: r.allowDownload,
      expiresAt: r.expiresAt,
      hasPassword: !!r.passwordHash,
      downloadCount: r.downloadCount,
      createdAt: r.createdAt,
    })),
  });
}

// POST /api/shares
// body: {
//   path?: string,        // 단일 파일 (backward compat)
//   paths?: string[],     // 여러 파일 묶음 (신규, 프로젝트 모드)
//   title?: string,       // 프로젝트명 (없으면 파일명)
//   expiresInDays?: number,
//   password?: string,
//   allowComments?: boolean,
//   allowDownload?: boolean,
// }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  // paths (배열) or path (단일) — 하나는 있어야
  const rawPaths: string[] = Array.isArray(body?.paths)
    ? body.paths.map(String).filter(Boolean)
    : body?.path
      ? [String(body.path)]
      : [];

  if (rawPaths.length === 0) {
    return NextResponse.json({ error: "path or paths required" }, { status: 400 });
  }

  // 접근 권한 확인 (파트너는 본인 파일만 공유 가능)
  for (const p of rawPaths) {
    if (!(await canAccessFile(session, p))) {
      return NextResponse.json({ error: `접근 불가: ${p}` }, { status: 403 });
    }
  }

  // 모든 파일 존재 확인
  for (const p of rawPaths) {
    try {
      const { stat } = await statPath(p);
      if (stat.isDirectory()) {
        return NextResponse.json({ error: `폴더 공유는 아직 지원하지 않아요: ${p}` }, { status: 400 });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: `${p}: ${msg}` }, { status: 400 });
    }
  }

  const token = generateToken();
  // 비번 기능 제거 — 새 링크는 항상 비번 없음 (기존 passwordHash 가진 레거시 링크는 호환 유지)
  const passwordHash = null;
  const expiresAt =
    typeof body?.expiresInDays === "number" && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const isMulti = rawPaths.length > 1;
  const primaryPath = rawPaths[0];
  const title = body?.title ? String(body.title).slice(0, 200) : null;

  // 모드: 'preview' (재생 전용, 기본) | 'full' (피드백 가능)
  const mode = body?.mode === "full" ? "full" : "preview";
  // 풀모드면 자동으로 댓글 허용 (explicit 지정 있으면 그걸 따름)
  const allowComments =
    body?.allowComments !== undefined
      ? !!body.allowComments
      : mode === "full";

  await db.insert(shareLinks).values({
    id: randomUUID(),
    token,
    filePath: primaryPath, // 첫 파일 (backward compat)
    paths: isMulti ? JSON.stringify(rawPaths) : null,
    title,
    mode,
    allowComments,
    allowDownload: body?.allowDownload !== false, // 기본 true
    createdBy: session.sub,
    expiresAt,
    passwordHash,
  });

  return NextResponse.json({ ok: true, token });
}
