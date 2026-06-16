import { sql, eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  fileUploads,
  comments,
  shareLinks,
  scanHistory,
  encodingJobs,
  hlsAssets,
  clientVideos,
  shareViews,
} from "@/lib/db/schema";

/**
 * 파일/폴더 rename·move 후 모든 DB 참조 경로를 트랜잭션으로 갱신.
 * - 파일: exact match만 갱신
 * - 폴더: from = to OR from으로 시작하는 모든 경로의 prefix 치환
 *
 * postgres-js 드라이버라 transaction 콜백은 async 이며 각 쿼리에 await 가 필요하다.
 * 콜백 내부는 await 로 순차 실행한다.
 *
 * 호출 시점: fs.rename 성공 후. 실패하면 throw — 상위에서 처리.
 */
export async function syncDbPathsAfterMove(
  from: string,
  to: string,
  isDir: boolean,
): Promise<void> {
  const fromPrefix = from + "/";
  const toPrefix = to + "/";
  const likePattern = fromPrefix + "%";
  // SQL substr(s, X)에서 X는 1-based. fromPrefix 길이만큼 잘라낸 다음을 원함.
  const substrFrom = fromPrefix.length + 1;

  await db.transaction(async (tx) => {
    // ───── 1) file_uploads.path (PK) ─────
    await tx.update(fileUploads).set({ path: to }).where(eq(fileUploads.path, from));
    if (isDir) {
      await tx
        .update(fileUploads)
        .set({ path: sql`${toPrefix} || substr(${fileUploads.path}, ${substrFrom})` })
        .where(like(fileUploads.path, likePattern));
    }

    // ───── 2) comments.file_path ─────
    await tx.update(comments).set({ filePath: to }).where(eq(comments.filePath, from));
    if (isDir) {
      await tx
        .update(comments)
        .set({ filePath: sql`${toPrefix} || substr(${comments.filePath}, ${substrFrom})` })
        .where(like(comments.filePath, likePattern));
    }

    // ───── 3) scan_history.file_path ─────
    await tx.update(scanHistory).set({ filePath: to }).where(eq(scanHistory.filePath, from));
    if (isDir) {
      await tx
        .update(scanHistory)
        .set({ filePath: sql`${toPrefix} || substr(${scanHistory.filePath}, ${substrFrom})` })
        .where(like(scanHistory.filePath, likePattern));
    }

    // ───── 4) encoding_jobs.file_path ─────
    await tx.update(encodingJobs).set({ filePath: to }).where(eq(encodingJobs.filePath, from));
    if (isDir) {
      await tx
        .update(encodingJobs)
        .set({ filePath: sql`${toPrefix} || substr(${encodingJobs.filePath}, ${substrFrom})` })
        .where(like(encodingJobs.filePath, likePattern));
    }

    // ───── 5) hls_assets.file_path (UNIQUE) ─────
    await tx.update(hlsAssets).set({ filePath: to }).where(eq(hlsAssets.filePath, from));
    if (isDir) {
      await tx
        .update(hlsAssets)
        .set({ filePath: sql`${toPrefix} || substr(${hlsAssets.filePath}, ${substrFrom})` })
        .where(like(hlsAssets.filePath, likePattern));
    }

    // ───── 6) client_videos.file_path ─────
    // ⚠️ TODO(Phase 1): Phase 1 에서 UNIQUE(client_id, file_path) 가 도입되면, 이 file_path 갱신이
    //   "같은 클라에 to 경로가 이미 등록된 경우" unique 위반으로 throw → 트랜잭션 전체 롤백(=move 실패)
    //   할 수 있다(기존엔 제약 없어 통과하던 케이스). 올바른 동작(중복 행 merge vs skip vs 사용자에게
    //   에러)은 제품 결정 사항이라 추측 구현하지 않음. 마이그 적용 후 폴더 이동 회귀 테스트로 재현 →
    //   onConflictDoNothing(중복 행 삭제) 또는 사전 충돌 검사로 방어 결정 필요.
    await tx.update(clientVideos).set({ filePath: to }).where(eq(clientVideos.filePath, from));
    if (isDir) {
      await tx
        .update(clientVideos)
        .set({ filePath: sql`${toPrefix} || substr(${clientVideos.filePath}, ${substrFrom})` })
        .where(like(clientVideos.filePath, likePattern));
    }

    // ───── 7) share_views.file_path ─────
    await tx.update(shareViews).set({ filePath: to }).where(eq(shareViews.filePath, from));
    if (isDir) {
      await tx
        .update(shareViews)
        .set({ filePath: sql`${toPrefix} || substr(${shareViews.filePath}, ${substrFrom})` })
        .where(like(shareViews.filePath, likePattern));
    }

    // ───── 8) share_links.file_path ─────
    await tx.update(shareLinks).set({ filePath: to }).where(eq(shareLinks.filePath, from));
    if (isDir) {
      await tx
        .update(shareLinks)
        .set({ filePath: sql`${toPrefix} || substr(${shareLinks.filePath}, ${substrFrom})` })
        .where(like(shareLinks.filePath, likePattern));
    }

    // ───── 9) share_links.paths (JSON 배열) — JS에서 파싱 후 매칭 항목 치환 ─────
    const rows = await tx
      .select({ id: shareLinks.id, paths: shareLinks.paths })
      .from(shareLinks);
    for (const r of rows) {
      if (!r.paths) continue;
      let arr: unknown;
      try {
        arr = JSON.parse(r.paths);
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = (arr as unknown[]).map((p) => {
        if (typeof p !== "string") return p;
        if (p === from) {
          changed = true;
          return to;
        }
        if (isDir && p.startsWith(fromPrefix)) {
          changed = true;
          return toPrefix + p.slice(fromPrefix.length);
        }
        return p;
      });
      if (changed) {
        await tx
          .update(shareLinks)
          .set({ paths: JSON.stringify(next) })
          .where(eq(shareLinks.id, r.id));
      }
    }
  });
}
