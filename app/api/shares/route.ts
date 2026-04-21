import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
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
  const passwordHash = body?.password ? await bcrypt.hash(String(body.password), 10) : null;
  const expiresAt =
    typeof body?.expiresInDays === "number" && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const isMulti = rawPaths.length > 1;
  const primaryPath = rawPaths[0];
  const title = body?.title ? String(body.title).slice(0, 200) : null;

  await db.insert(shareLinks).values({
    id: randomUUID(),
    token,
    filePath: primaryPath, // 첫 파일 (backward compat)
    paths: isMulti ? JSON.stringify(rawPaths) : null,
    title,
    allowComments: !!body?.allowComments,
    allowDownload: body?.allowDownload !== false, // 기본 true
    createdBy: session.sub,
    expiresAt,
    passwordHash,
  });

  return NextResponse.json({ ok: true, token });
}
