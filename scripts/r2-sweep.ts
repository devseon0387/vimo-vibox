// R2 "가장 빠른 다운로드 경로" TTL 스윕 — 3일(R2_TTL_DAYS) 지난 캐시 객체를 R2에서 축출.
// 적재(cacheVideo) 시에도 기회적으로 sweep 하지만, 공유가 뜸할 때를 대비해 launchd 크론에서 주기 호출.
//   사용: npx tsx scripts/r2-sweep.ts   (env: DATABASE_URL, R2_*, RCLONE_*)
//   launchd 예: com.vibox.r2sweep (StartCalendarInterval, 1일 1~2회) — 운영에서 별도 등록.
import { sweepExpired } from "@/lib/r2-replicate";
import { r2Enabled } from "@/lib/r2";

(async () => {
  if (!r2Enabled()) {
    console.log("[r2-sweep] R2 미설정 — skip");
    process.exit(0);
  }
  try {
    const n = await sweepExpired();
    console.log(`[r2-sweep] 만료 축출 ${n}건`);
  } catch (e) {
    console.error("[r2-sweep] 실패:", (e as Error).message);
  }
  process.exit(0);
})();
