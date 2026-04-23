import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { getZoneRoot } from "@/lib/fs/storage";

// GET /api/my/box/usage
// 본인 개인 드라이브 사용량 + 쿼타 반환
async function dirSize(dir: string): Promise<{ size: number; files: number }> {
  let size = 0;
  let files = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { size, files };
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isFile()) {
        const stat = await fs.stat(full);
        size += stat.size;
        files += 1;
      } else if (e.isDirectory()) {
        const sub = await dirSize(full);
        size += sub.size;
        files += sub.files;
      }
    } catch {}
  }
  return { size, files };
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [u] = await db
    .select({ quotaGb: users.quotaGb })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  const quotaGb = u?.quotaGb ?? 100;
  const quotaBytes = quotaGb * 1024 * 1024 * 1024;

  const personalRoot = getZoneRoot("personal");
  const userDir = path.join(personalRoot, session.sub);
  const { size, files } = await dirSize(userDir);

  return NextResponse.json({
    usedBytes: size,
    quotaBytes,
    fileCount: files,
    pct: quotaBytes > 0 ? size / quotaBytes : 0,
  });
}

export const runtime = "nodejs";
