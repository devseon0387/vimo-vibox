#!/usr/bin/env tsx
/**
 * SSD 저장소와 DB를 대조하여 고아 데이터 정리
 *
 * 사용법:
 *   tsx scripts/reconcile.ts            # dry-run (삭제 대상만 출력)
 *   tsx scripts/reconcile.ts --apply    # 실제 삭제 수행
 */
import "./_loadenv"; // 반드시 첫 줄 (db/client 읽기 전에 env 주입)
import { runReconcile, formatBytes } from "../lib/reconcile";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`▸ Vibox 저장소 리콘실 ${apply ? "(적용 모드)" : "(드라이런)"}`);
  console.log("");

  const r = await runReconcile({ apply });

  console.log(`✓ SSD 활성 파일: ${r.liveFileCount}개`);
  console.log("");

  if (r.legacyDir) {
    console.log(
      `• 레거시 디렉터리: ${r.legacyDir.path} (${r.legacyDir.files}개 파일, ${formatBytes(r.legacyDir.sizeBytes)})`,
    );
  } else {
    console.log("• 레거시 디렉터리: 없음");
  }

  console.log(
    `• 고아 썸네일: ${r.orphanThumbs.length}개 (${formatBytes(r.orphanThumbs.reduce((s, t) => s + t.sizeBytes, 0))})`,
  );
  if (r.orphanThumbs.length > 0 && r.orphanThumbs.length <= 10) {
    for (const t of r.orphanThumbs) {
      console.log(`    - ${t.path} (${formatBytes(t.sizeBytes)})`);
    }
  } else if (r.orphanThumbs.length > 10) {
    for (const t of r.orphanThumbs.slice(0, 5)) {
      console.log(`    - ${t.path} (${formatBytes(t.sizeBytes)})`);
    }
    console.log(`    ... 외 ${r.orphanThumbs.length - 5}개`);
  }

  console.log(
    `• 고아 청크 업로드: ${r.orphanChunks.length}개 (${formatBytes(r.orphanChunks.reduce((s, c) => s + c.sizeBytes, 0))})`,
  );
  for (const c of r.orphanChunks) {
    console.log(
      `    - ${c.filename ?? c.fileId} (${formatBytes(c.sizeBytes)}, ${c.ageHours}h 경과)`,
    );
  }

  console.log("");
  console.log("DB 고아:");
  console.log(`  - comments: ${r.orphanDb.comments.length}개`);
  console.log(`  - file_uploads: ${r.orphanDb.fileUploads.length}개`);
  console.log(`  - share_links: ${r.orphanDb.shareLinks.length}개`);
  console.log(`  - scan_history: ${r.orphanDb.scanHistory.length}개`);
  console.log(`  - traffic_log (90일 초과): ${r.oldTrafficLogs}개`);

  console.log("");
  console.log(
    `≫ 회수 예상 용량: ${formatBytes(r.totalBytesFreed)}${apply ? " (삭제 완료)" : " (드라이런 — --apply로 실행)"}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
