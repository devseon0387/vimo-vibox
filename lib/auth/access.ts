import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";
import { parseZoneFromPath, personalOwnerOf } from "@/lib/fs/storage";
import type { SessionPayload } from "./session";

/**
 * 파일 접근 권한 체크. zone별로 규칙 다름.
 *
 * - rendering (기본, /Shared/): admin/member 전부 / partner 는 본인 업로드만
 * - library (/library/*): 모든 로그인 유저 읽기 가능. 쓰기는 upload 경로에서 staff 제한
 * - personal (/personal/{userId}/*): 본인 또는 admin 만
 */
export async function canAccessFile(
  session: SessionPayload | null,
  filePath: string,
): Promise<boolean> {
  if (!session) return false;
  const { zone } = parseZoneFromPath(filePath);

  // 개인 드라이브: 본인 or admin
  if (zone === "personal") {
    const ownerId = personalOwnerOf(filePath);
    if (!ownerId) return false;
    if (session.role === "admin") return true;
    return ownerId === session.sub;
  }

  // 자료실: 로그인만 돼 있으면 읽기 OK (쓰기는 upload 단에서 staff 체크)
  if (zone === "library") {
    return true;
  }

  // rendering (기존 정책)
  if (session.role === "admin" || session.role === "member") return true;
  if (session.role === "partner") {
    const rows = await db
      .select({ uploadedBy: fileUploads.uploadedBy })
      .from(fileUploads)
      .where(eq(fileUploads.path, filePath))
      .limit(1);
    if (rows.length === 0) return false;
    return rows[0].uploadedBy === session.sub;
  }
  return false;
}
