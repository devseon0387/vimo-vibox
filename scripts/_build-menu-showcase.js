/* 로컬 전용 — 워크플로 결과(8개 메뉴바 시안 + 심사)를 하나의 비교 쇼케이스 HTML로 조립.
   실행: node scripts/_build-menu-showcase.js <workflow-output.json> */
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] ||
  "/private/tmp/claude-501/-Users-vimo/32860752-3253-41ab-8466-113b6f351a9b/tasks/wt311me4s.output";
const OUT = process.argv[3] ||
  path.join(process.env.HOME, "Desktop/vibox-ui-mockups/menu-designs.html");
const TITLE = process.argv[4] || "vibox 메뉴바 UX 시안";
const SUB = process.argv[5] ||
  "좌측 내비게이션을 \"더 편하게\" — 8가지 설계 방향. 점수 높은 순으로 정렬했어요. 실제 vibox 메뉴 내용·디자인 토큰·lucide 아이콘 기준.";
const NOTE = process.argv[6] ||
  "<b>지금 구조의 문제</b> — Rail(84px) + 컨텍스트 패널(240px) = 합 <b>324px</b>를 항상 2단으로 차지. 1·2차 내비가 좌우로 분리돼 시선 점프가 잦음. 아래 시안들은 폭 절약 · 위계 단순화 · 발견성을 각자 다른 방식으로 해결합니다.";

const data = JSON.parse(fs.readFileSync(SRC, "utf8")).result;
const designs = data.designs || [];
const crit = data.critique || { ranking: [], summary: "", topPick: "" };

// 새니타이즈 — 별/기타 데코 기호(★☆◆● 등)는 lucide 규칙상 금지. (주석/장식에 섞여도 제거)
designs.forEach((d) => {
  d.html = String(d.html || "").replace(/[★☆◆●•✨✔✅❌]/g, "");
});

const rankMap = {};
(crit.ranking || []).forEach((r) => (rankMap[r.id] = r));
// 점수 내림차순 정렬
const ordered = [...designs].sort(
  (a, b) => (rankMap[b.id]?.score ?? 0) - (rankMap[a.id]?.score ?? 0),
);

// ── 이모지 스캔 (⌘ U+2318, 기본 화살표 제외 / 픽토그래픽 이모지 검출) ──
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{2600}-\u{26FF}\u{2705}\u{2714}\u{2716}\u{274C}\u{2728}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
const emojiReport = [];
designs.forEach((d) => {
  const hits = [...(d.html.match(new RegExp(emojiRe, "gu")) || [])];
  if (hits.length) emojiReport.push({ id: d.id, name: d.name, hits: [...new Set(hits)] });
});

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const card = (d, i) => {
  const r = rankMap[d.id] || {};
  const isTop = d.id === crit.topPick;
  const rankNo = i + 1;
  return `
  <section class="card${isTop ? " card-top" : ""}">
    <div class="card-head">
      <div class="rank">${rankNo}</div>
      <div class="card-title">
        <div class="name-row">
          <h2>${esc(d.name)}</h2>
          ${isTop ? '<span class="pick">추천</span>' : ""}
          <span class="wbadge">${esc(d.widthLabel)}</span>
          <span class="score">${r.score != null ? r.score : "-"}<small>/100</small></span>
        </div>
        <p class="tagline">${esc(d.tagline)}</p>
      </div>
    </div>
    <div class="frame-wrap">
      ${d.html}
    </div>
    <div class="meta">
      <div class="meta-col"><span class="lbl up">왜 더 편한가</span><p>${esc(d.whyEasier)}</p></div>
      <div class="meta-col"><span class="lbl down">단점·주의</span><p>${esc(d.tradeoffs)}</p></div>
      ${r.verdict ? `<div class="meta-col verdict"><span class="lbl judge">심사 한줄평</span><p>${esc(r.verdict)}</p></div>` : ""}
    </div>
  </section>`;
};

const rankBar = (crit.ranking || [])
  .slice()
  .sort((a, b) => b.score - a.score)
  .map((r) => {
    const d = designs.find((x) => x.id === r.id);
    const top = r.id === crit.topPick;
    return `<div class="rb-row${top ? " rb-top" : ""}"><span class="rb-name">${esc(d ? d.name : r.id)}</span><span class="rb-track"><span class="rb-fill" style="width:${r.score}%"></span></span><span class="rb-score">${r.score}</span></div>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)} · vibox</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<style>
  :root{
    --accent:#e85008; --accent-dark:#c8430a; --accent-soft:#fef0e8;
    --sky:#0ea5e9; --sky-dark:#0369a1; --sky-soft:#e0f2fe;
    --text:#111111; --muted:#555555; --faint:#999999;
    --surface:#fafafa; --hover:#f4f4f5; --border:#ececec;
  }
  *{box-sizing:border-box;}
  body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",system-ui,sans-serif;background:#f6f6f7;color:var(--text);margin:0;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1000px;margin:0 auto;padding:40px 24px 80px;}
  header.page h1{font-size:28px;font-weight:800;letter-spacing:-0.02em;margin:0 0 8px;}
  header.page p.sub{font-size:14px;color:var(--muted);margin:0;line-height:1.6;}
  .note{margin-top:16px;font-size:12.5px;color:var(--muted);background:#fff;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;line-height:1.6;}
  .summary{margin:28px 0;background:#fff;border:1px solid var(--border);border-radius:14px;padding:20px 22px;}
  .summary h3{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--faint);text-transform:uppercase;margin:0 0 10px;}
  .summary p.verdict-sum{font-size:14px;line-height:1.7;color:var(--text);margin:0 0 16px;}
  .rb-row{display:flex;align-items:center;gap:10px;margin:5px 0;}
  .rb-name{width:160px;flex:none;font-size:12.5px;color:var(--muted);text-align:right;}
  .rb-top .rb-name{color:var(--accent-dark);font-weight:700;}
  .rb-track{flex:1;height:7px;background:var(--hover);border-radius:99px;overflow:hidden;}
  .rb-fill{display:block;height:100%;background:linear-gradient(90deg,#f3a06a,var(--accent));border-radius:99px;}
  .rb-top .rb-fill{background:linear-gradient(90deg,var(--accent),var(--accent-dark));}
  .rb-score{width:30px;flex:none;font-size:12px;font-weight:700;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;}
  .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin:22px 0;box-shadow:0 1px 2px rgba(0,0,0,0.03);}
  .card-top{border-color:var(--accent);box-shadow:0 8px 30px -16px rgba(232,80,8,0.45);}
  .card-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px;}
  .rank{width:30px;height:30px;flex:none;border-radius:9px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--faint);}
  .card-top .rank{background:var(--accent);border-color:var(--accent);color:#fff;}
  .name-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
  .card h2{font-size:17px;font-weight:700;margin:0;letter-spacing:-0.01em;}
  .pick{font-size:11px;font-weight:700;color:#fff;background:var(--accent);border-radius:999px;padding:2px 9px;}
  .wbadge{font-size:11px;font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:2px 9px;}
  .score{margin-left:auto;font-size:18px;font-weight:800;color:var(--text);}
  .score small{font-size:11px;font-weight:600;color:var(--faint);}
  .tagline{font-size:13px;color:var(--muted);margin:5px 0 0;line-height:1.5;}
  .frame-wrap{display:flex;justify-content:center;background:repeating-linear-gradient(45deg,#fbfbfc,#fbfbfc 10px,#f6f6f7 10px,#f6f6f7 20px);border:1px solid var(--border);border-radius:12px;padding:22px;overflow:auto;}
  .frame{width:880px;height:560px;flex:none;background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 10px 40px -20px rgba(0,0,0,0.25);}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;}
  .meta-col .lbl{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:5px;}
  .lbl.up{color:var(--accent-dark);} .lbl.down{color:var(--faint);} .lbl.judge{color:var(--sky-dark);}
  .meta-col p{font-size:12.5px;line-height:1.6;color:var(--muted);margin:0;}
  .meta-col.verdict p{color:var(--text);}
  @media(max-width:760px){ .meta{grid-template-columns:1fr;} }
  footer.page{margin-top:40px;font-size:12px;color:var(--faint);border-top:1px solid var(--border);padding-top:18px;line-height:1.7;}
</style>
</head>
<body>
  <div class="wrap">
    <header class="page">
      <h1>${esc(TITLE)}</h1>
      <p class="sub">${esc(SUB)}</p>
      <div class="note">${NOTE}</div>
    </header>

    <div class="summary">
      <h3>심사 요약 · 추천</h3>
      <p class="verdict-sum">${esc(crit.summary)}</p>
      ${rankBar}
    </div>

    ${ordered.map((d, i) => card(d, i)).join("\n")}

    <footer class="page">
      ${designs.length}개 시안 · 멀티에이전트 생성 후 UX 심사 · 라이트 테마 · lucide 아이콘(이모지 없음) · ⌘K 검색.<br>
      추천 시안을 고르면 실제 컴포넌트(Rail/MenuRouter)로 구현해 드릴게요.
    </footer>
  </div>
  <script>lucide.createIcons();</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, "utf8");
console.log("✔ 작성:", OUT, "(" + html.length + " bytes)");
console.log("시안 순위:", ordered.map((d, i) => (i + 1) + "." + d.name + "(" + (rankMap[d.id]?.score ?? "-") + ")").join("  "));
console.log("추천(topPick):", crit.topPick, "=", (designs.find((d) => d.id === crit.topPick) || {}).name);
if (emojiReport.length) {
  console.log("\n⚠ 이모지 발견:");
  emojiReport.forEach((e) => console.log("  " + e.id + " " + e.name + ":", e.hits.join(" ")));
} else {
  console.log("\n이모지 스캔: 깨끗함 ✓ (lucide만 사용)");
}
