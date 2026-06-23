#!/usr/bin/env node
// 디자인 토큰 가드 — 마이그레이션된 타이포(9~18·22px)가 arbitrary text-[Xpx]로
// 재등장하는 것을 차단해 일관성을 유지한다. 특수 크기(outlier)만 허용.
//   허용: 8 · 8.5 · 20 · 24 · 26 · 28 (프레임 라벨·통계 숫자·로그인/노트 제목 등)
//   그 외 text-[Xpx] → text-2xs ~ text-2xl 토큰 사용해야 함.
// 실행: node scripts/check-design.mjs   (CI/배포 전 권장)
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ALLOWED = new Set(["8", "8.5", "20", "24", "26", "28"]);

const files = execSync("git ls-files", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(
    (f) =>
      f.endsWith(".tsx") &&
      (f.startsWith("components/") || f.startsWith("app/")),
  );

const violations = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (!ALLOWED.has(m[1])) {
        violations.push(`${f}:${i + 1}  text-[${m[1]}px]`);
      }
    }
  });
}

if (violations.length) {
  console.error(
    `\n✗ 디자인 토큰 위반 ${violations.length}건 — 타이포는 text-2xs~text-2xl 토큰을 쓰세요:\n`,
  );
  for (const v of violations) console.error("  " + v);
  console.error(
    `\n  허용 outlier 크기: ${[...ALLOWED].join(", ")}px (특수 헤딩/라벨)\n`,
  );
  process.exit(1);
}
console.log("✓ 디자인 토큰 가드 통과 — arbitrary 타이포 없음 (outlier 제외)");
