import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getZoneRoot } from "@/lib/fs/storage";

export type PersonalUsage = {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  pct: number;
};

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

/**
 * 한 유저의 개인 드라이브(/personal/{userId}) 사용량 + 쿼타.
 * API 라우트(/api/my/box/usage)와 My Box 서버 페이지가 공유.
 */
export async function getPersonalUsage(userId: string): Promise<PersonalUsage> {
  const [u] = await db
    .select({ quotaGb: users.quotaGb })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const quotaGb = u?.quotaGb ?? 100;
  const quotaBytes = quotaGb * 1024 * 1024 * 1024;

  const userDir = path.join(getZoneRoot("personal"), userId);
  const { size, files } = await dirSize(userDir);

  return {
    usedBytes: size,
    quotaBytes,
    fileCount: files,
    pct: quotaBytes > 0 ? size / quotaBytes : 0,
  };
}
