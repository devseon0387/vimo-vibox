import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { resolveSafePath } from "@/lib/fs/storage";

/**
 * POST /api/files/check  body: { paths: ["/foo/a.mp4", ...] }
 *  → { existing: ["/foo/a.mp4", ...] }  (실제 파일이 존재하는 것만)
 * 폴더 업로드 전 충돌 사전 감지용. 권한 통과한 경로만 검사.
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const paths = Array.isArray(body?.paths) ? body.paths : null;
  if (!paths) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }
  if (paths.length > 5000) {
    return NextResponse.json({ error: "too many paths" }, { status: 400 });
  }

  const existing: string[] = [];
  for (const p of paths) {
    if (typeof p !== "string") continue;
    const nfc = p.normalize("NFC");
    if (!(await canAccessFile(session, nfc))) continue;
    let abs: string;
    try {
      abs = resolveSafePath(nfc);
    } catch {
      continue;
    }
    try {
      await fs.access(abs);
      existing.push(nfc);
    } catch {
      // not existing — skip
    }
  }
  return NextResponse.json({ existing });
}

export const runtime = "nodejs";
