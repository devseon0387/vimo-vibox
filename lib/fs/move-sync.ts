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

    // ───── 5) hls_assets.file_path (단일 UNIQUE) — client_videos(§6)와 동일 split-brain 방어 ─────
    // 대상 경로에 이미 HLS 자산이 있으면 이동(fs.rename 덮어쓰기)으로 그 자산은 stale 이 된다.
    // 무방어 UPDATE 는 file_path UNIQUE 위반→tx 롤백→fs.rename 후라 disk≠DB split-brain. 게다가 이 §5 는
    // §6 보다 먼저라, 같은 move 가 hls_assets 충돌을 내면 §6 방어에 닿기도 전에 트랜잭션이 죽는다.
    // → 대상 경로의 stale 자산을 먼저 삭제(세그먼트는 fingerprint 로 content-addressed 라 무관) 후 이동.
    await tx.execute(sql`DELETE FROM hls_assets WHERE file_path = ${to}`);
    await tx.update(hlsAssets).set({ filePath: to }).where(eq(hlsAssets.filePath, from));
    if (isDir) {
      await tx.execute(sql`
        DELETE FROM hls_assets d
        WHERE EXISTS (SELECT 1 FROM hls_assets s
                      WHERE s.file_path LIKE ${likePattern}
                        AND d.file_path = ${toPrefix} || substr(s.file_path, ${substrFrom})
                        AND d.fingerprint <> s.fingerprint)
      `);
      await tx
        .update(hlsAssets)
        .set({ filePath: sql`${toPrefix} || substr(${hlsAssets.filePath}, ${substrFrom})` })
        .where(like(hlsAssets.filePath, likePattern));
    }

    // ───── 6) client_videos.file_path (UNIQUE(client_id, file_path) 충돌 방어) ─────
    // 파일을 "이미 존재하는 대상 경로"로 이동(덮어쓰기)하면, 같은 클라가 그 대상 경로를 이미
    // 등록한 경우 from→to 갱신이 unique 위반으로 throw → 트랜잭션 전체 롤백된다. 이 함수는
    // fs.rename "성공 후" 호출되므로 그 롤백은 disk≠DB split-brain(모든 경로 테이블 미갱신)을 남긴다.
    // → 충돌하는 from 행을 먼저 삭제(살아남는 to 행이 그 클라의 등록을 계속 대표)해 위반을 차단한다.
    //   삭제되는 from 행의 status/displayOrder 는 손실되나 의미상 동일 파일이라 to 행으로 수렴한다.
    //   충돌 없는 일반 케이스엔 영향 없음(EXISTS 가 거짓 → 삭제 0).
    await tx.execute(sql`
      DELETE FROM client_videos a
      WHERE a.file_path = ${from}
        AND EXISTS (SELECT 1 FROM client_videos b
                    WHERE b.client_id = a.client_id AND b.file_path = ${to} AND b.id <> a.id)
    `);
    await tx.update(clientVideos).set({ filePath: to }).where(eq(clientVideos.filePath, from));
    if (isDir) {
      await tx.execute(sql`
        DELETE FROM client_videos a
        WHERE a.file_path LIKE ${likePattern}
          AND EXISTS (SELECT 1 FROM client_videos b
                      WHERE b.client_id = a.client_id
                        AND b.file_path = ${toPrefix} || substr(a.file_path, ${substrFrom})
                        AND b.id <> a.id)
      `);
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
