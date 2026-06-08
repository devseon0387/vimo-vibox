/* 로컬 전용 — 워크플로 결과(파트너 홈 UX 감사 + 시안 N개 + 심사)를 하나의 비교 쇼케이스 HTML로 조립.
   실행: node scripts/_build-partner-showcase.js <workflow-output.json> [out.html] */
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/_build-partner-showcase.js <workflow-output.json> [out.html]");
  process.exit(1);
}
const OUT =
  process.argv[3] ||
  path.join(process.env.HOME, "Desktop/vibox-ui-mockups/partner-redesign.html");
const TITLE = process.argv[4] || "vibox 파트너 홈 — UX 재설계 시안";
const SUB =
  process.argv[5] ||
  "외부 편집자(파트너) 홈을 \"핵심 루프\"(올리기 → 피드백 → 수정 재업로드)에 맞춰 다시 설계한 방향들. 점수 높은 순. 실제 vibox 라이트 테마·콘텐츠·lucide 아이콘 기준.";

const parsed = JSON.parse(fs.readFileSync(SRC, "utf8"));
const data = parsed.result || parsed;
const designs = data.designs || [];
const crit = data.critique || { ranking: [], summary: "", topPick: "" };
const audit = data.audit || [];

// 새니타이즈 — 별/기타 데코 기호(lucide 규칙상 금지)
designs.forEach((d) => {
  d.html = String(d.html || "").replace(/[★☆◆●•✨✔✅❌▲▼]/g, "");
});

const rankMap = {};
(crit.ranking || []).forEach((r) => (rankMap[r.id] = r));
const ordered = [...designs].sort(
  (a, b) => (rankMap[b.id]?.score ?? 0) - (rankMap[a.id]?.score ?? 0),
);

// 이모지 스캔
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{2600}-\u{26FF}\u{2705}\u{2714}\u{2716}\u{274C}\u{2728}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
const emojiReport = [];
designs.forEach((d) => {
  const hits = [...(d.html.match(new RegExp(emojiRe, "gu")) || [])];
  if (hits.length) emojiReport.push({ id: d.id, name: d.name, hits: [...new Set(hits)] });
});

const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const impactColor = { high: "#c2410c", medium: "#a16207", low: "#999999" };
const auditRows = audit
  .map(
    (a) =>
      `<li class="aud-row"><span class="aud-imp" style="color:${impactColor[a.impact] || "#999"}">${esc(
        a.impact,
      )}</span><span class="aud-txt"><b>${esc(a.issue)}</b><span class="aud-why">${esc(a.why)}</span></span></li>`,
  )
  .join("");

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
      <div class="meta-col"><span class="lbl up">왜 더 낫나</span><p>${esc(d.whyEasier)}</p></div>
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
    return `<div class="rb-row${top ? " rb-top" : ""}"><span class="rb-name">${esc(
      d ? d.name : r.id,
    )}</span><span class="rb-track"><span class="rb-fill" style="width:${r.score}%"></span></span><span class="rb-score">${r.score}</span></div>`;
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
    --surface:#fafafa; --surface-2:#f7f7f7; --hover:#f4f4f5; --border:#ececec;
  }
  *{box-sizing:border-box;}
  body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",system-ui,sans-serif;background:#f6f6f7;color:var(--text);margin:0;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1280px;margin:0 auto;padding:40px 24px 80px;}
  header.page h1{font-size:28px;font-weight:800;letter-spacing:-0.02em;margin:0 0 8px;}
  header.page p.sub{font-size:14px;color:var(--muted);margin:0;line-height:1.6;}
  .note{margin-top:16px;font-size:12.5px;color:var(--muted);background:#fff;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;line-height:1.6;}
  /* 감사 */
  .audit{margin:24px 0;background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px 20px;}
  .audit h3{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--faint);text-transform:uppercase;margin:0 0 12px;}
  .aud-row{display:flex;gap:12px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--surface);list-style:none;}
  .aud-row:first-child{border-top:none;}
  .aud-imp{flex:none;width:58px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding-top:2px;}
  .aud-txt{font-size:13px;line-height:1.5;}
  .aud-txt b{font-weight:600;color:var(--text);}
  .aud-why{display:block;font-size:12px;color:var(--muted);margin-top:2px;}
  ul{margin:0;padding:0;}
  /* 심사 요약 */
  .summary{margin:24px 0 8px;background:#fff;border:1px solid var(--border);border-radius:14px;padding:20px 22px;}
  .summary h3{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--faint);text-transform:uppercase;margin:0 0 10px;}
  .summary p.verdict-sum{font-size:14px;line-height:1.7;color:var(--text);margin:0 0 16px;}
  .rb-row{display:flex;align-items:center;gap:10px;margin:5px 0;}
  .rb-name{width:140px;flex:none;font-size:12.5px;color:var(--muted);text-align:right;}
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
  .frame{flex:none;border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 10px 40px -20px rgba(0,0,0,0.25);}
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
      <div class="note"><b>파트너 핵심 루프</b> — 완성본 올린다 → 비모팀 피드백 받는다 → 수정 요청 보고 수정본 다시 올린다. 아래 시안들은 이 루프를 한 화면에서 더 빠르게 돌도록, 그리고 넓은 화면의 빈 공간을 의미있게 채우도록 각자 다른 방식으로 해결합니다.</div>
    </header>

    ${audit.length ? `<div class="audit"><h3>현재 화면 UX 감사 (${audit.length})</h3><ul>${auditRows}</ul></div>` : ""}

    <div class="summary">
      <h3>심사 요약 · 추천</h3>
      <p class="verdict-sum">${esc(crit.summary)}</p>
      ${rankBar}
    </div>

    ${ordered.map((d, i) => card(d, i)).join("\n")}

    <footer class="page">
      ${designs.length}개 시안 · 멀티에이전트 생성 후 UX 심사 · 라이트 테마 · lucide 아이콘(이모지 없음).<br>
      추천 시안을 고르면 실제 컴포넌트(PartnerHome / PartnerShell)로 구현해 드릴게요.
    </footer>
  </div>
  <script>lucide.createIcons();</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, "utf8");
console.log("작성:", OUT, "(" + html.length + " bytes)");
console.log("시안 순위:", ordered.map((d, i) => (i + 1) + "." + d.name + "(" + (rankMap[d.id]?.score ?? "-") + ")").join("  "));
console.log("추천(topPick):", crit.topPick, "=", (designs.find((d) => d.id === crit.topPick) || {}).name);
if (emojiReport.length) {
  console.log("\n[경고] 이모지 발견:");
  emojiReport.forEach((e) => console.log("  " + e.id + " " + e.name + ":", e.hits.join(" ")));
} else {
  console.log("\n이모지 스캔: 깨끗함 (lucide만)");
}
