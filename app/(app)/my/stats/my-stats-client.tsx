"use client";

import { useEffect, useMemo, useState } from "react";

type Stats = {
  period: { from: number; to: number; days: number };
  kpi: {
    uploads: number;
    uploadsPrev: number;
    feedback: number;
    feedbackPrev: number;
    resolved: number;
    resolvedRate: number;
    resolvedRatePrev: number;
    praise: number;
    praisePrev: number;
  };
  categories: Array<{
    category: string;
    label: string;
    count: number;
    prev: number;
  }>;
  praiseList: Array<{
    body: string;
    filePath: string;
    createdAt: number;
    fromName: string;
  }>;
  repeatWarning: { keyword: string; count: number } | null;
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function deltaLabel(cur: number, prev: number, unit = "", pct = true): {
  text: string;
  dir: "up" | "down" | "flat";
} {
  if (prev === 0 && cur === 0) return { text: "변화 없음", dir: "flat" };
  if (prev === 0) return { text: `신규 ${cur}${unit}`, dir: "up" };
  const diff = cur - prev;
  if (diff === 0) return { text: `전월 ${prev}${unit} 동일`, dir: "flat" };
  if (pct) {
    const pctVal = Math.round((diff / prev) * 100);
    return {
      text: `전월 ${prev}${unit} → ${cur}${unit} · ${pctVal > 0 ? "+" : ""}${pctVal}%`,
      dir: diff > 0 ? "up" : "down",
    };
  }
  return {
    text: `전월 ${prev}${unit} → ${cur}${unit}`,
    dir: diff > 0 ? "up" : "down",
  };
}

export function MyStatsClient({ name }: { name: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/my/stats?days=30")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, []);

  const maxCategory = useMemo(() => {
    if (!stats) return 1;
    return Math.max(1, ...stats.categories.map((c) => c.count));
  }, [stats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center text-[13px] text-slate-400">
        불러오는 중…
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center text-[13px] text-slate-400">
        데이터를 불러오지 못했어요
      </div>
    );
  }

  const { kpi, period, categories, praiseList, repeatWarning } = stats;
  const resolvedPct = Math.round(kpi.resolvedRate * 100);
  const resolvedPctPrev = Math.round(kpi.resolvedRatePrev * 100);

  const uploadsDelta = deltaLabel(kpi.uploads, kpi.uploadsPrev, "개");
  const feedbackDelta = deltaLabel(kpi.feedback, kpi.feedbackPrev, "건");
  const resolvedDelta = deltaLabel(resolvedPct, resolvedPctPrev, "%", false);
  const praiseDelta = deltaLabel(kpi.praise, kpi.praisePrev, "건");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="text-[11px] text-slate-500 tracking-wide mb-1">
          VIBOX · 내 기록
        </div>
        <h1 className="text-[20px] font-extrabold text-slate-900 mb-0.5">
          내 작업 기록
        </h1>
        <div className="text-[12px] text-slate-500 mb-6">
          {name} · 지난 {period.days}일 ({formatDate(period.from)} ~{" "}
          {formatDate(period.to)})
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="업로드"
            value={kpi.uploads}
            unit="개"
            delta={uploadsDelta}
          />
          <KpiCard
            label="받은 피드백"
            value={kpi.feedback}
            unit="건"
            delta={feedbackDelta}
            inverseDelta
          />
          <KpiCard
            label="반영 완료율"
            value={resolvedPct}
            unit="%"
            delta={resolvedDelta}
          />
          <KpiCard
            label="받은 칭찬"
            value={kpi.praise}
            unit="건"
            delta={praiseDelta}
          />
        </div>

        {/* 카테고리 분포 + 전월 추세 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
            <CardTitle
              title="받은 피드백 분포"
              tag={`${kpi.feedback}건 (수정 요청)`}
            />
            <div className="flex flex-col gap-1.5 mt-3">
              {categories.map((c) => {
                const pct =
                  kpi.feedback > 0
                    ? Math.round((c.count / kpi.feedback) * 100)
                    : 0;
                const widthPct =
                  maxCategory > 0 ? (c.count / maxCategory) * 100 : 0;
                return (
                  <div
                    key={c.category}
                    className="grid grid-cols-[80px_1fr_40px_52px] gap-2.5 items-center text-[12px]"
                  >
                    <span className="font-semibold text-slate-900">
                      {c.label}
                    </span>
                    <span className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <span
                        className="block h-full bg-slate-700 rounded-full"
                        style={{ width: `${widthPct}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-slate-500">
                      {c.count}
                    </span>
                    <span className="text-right font-semibold tabular-nums text-slate-900">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <CardTitle title="전월 대비 추세" />
            <div className="flex flex-col mt-3">
              {categories.map((c) => {
                const diff = c.count - c.prev;
                const pct = c.prev > 0 ? Math.round((diff / c.prev) * 100) : 0;
                const dir: "up" | "down" | "flat" =
                  diff === 0 ? "flat" : diff > 0 ? "up" : "down";
                const dirColor =
                  dir === "down"
                    ? "text-emerald-600"
                    : dir === "up"
                      ? "text-rose-600"
                      : "text-slate-400";
                return (
                  <div
                    key={c.category}
                    className="flex justify-between items-center text-[12px] py-2 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-semibold text-slate-900">
                      {c.label}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {c.prev} → {c.count}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${dirColor} w-[52px] text-right`}
                    >
                      {dir === "flat"
                        ? "—"
                        : `${pct > 0 ? "+" : ""}${pct}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 칭찬 + 반복 지적 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
            <CardTitle
              title="받은 칭찬"
              tag={`최근 ${praiseList.length}건`}
            />
            {praiseList.length === 0 ? (
              <div className="text-[12px] text-slate-400 italic mt-3">
                아직 받은 칭찬이 없어요
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 mt-3">
                {praiseList.map((p, i) => (
                  <div
                    key={i}
                    className="px-3 py-2.5 bg-fuchsia-50 border-l-[3px] border-fuchsia-500 rounded"
                  >
                    <div className="text-[12.5px] text-slate-900 font-medium">
                      &ldquo;{p.body}&rdquo;
                    </div>
                    <div className="text-[10.5px] text-fuchsia-800 mt-1">
                      {p.fromName || "익명"} · {p.filePath.split("/").pop()} ·{" "}
                      {formatShortDate(p.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <CardTitle title="반복되는 지적" />
            {repeatWarning ? (
              <div className="mt-3 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-md text-[12px]">
                <div className="font-bold text-amber-700 flex items-center gap-1.5">
                  ⚠ &ldquo;{repeatWarning.keyword}&rdquo;
                </div>
                <div className="text-amber-800 mt-1">
                  최근 {period.days}일 {repeatWarning.count}건 이상 지적됐어요.
                  업로드 전 한 번 더 확인해보면 같은 유형 피드백을 줄일 수 있어요.
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-slate-400 italic mt-3">
                반복되는 지적 없음 · 좋아요 👍
              </div>
            )}
          </div>
        </div>

        <div className="text-[10.5px] text-slate-400 text-center mt-6">
          이 페이지는 본인에게만 보여요 · 실시간 반영
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  delta,
  inverseDelta,
}: {
  label: string;
  value: number;
  unit: string;
  delta: { text: string; dir: "up" | "down" | "flat" };
  inverseDelta?: boolean;
}) {
  // inverseDelta=true → 증가가 나쁨, 감소가 좋음 (피드백 수 등)
  const good = inverseDelta
    ? delta.dir === "down"
    : delta.dir === "up";
  const bad = inverseDelta
    ? delta.dir === "up"
    : delta.dir === "down";
  const color =
    good
      ? "text-emerald-600"
      : bad
        ? "text-rose-600"
        : "text-slate-400";
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
      <div className="text-[10.5px] font-bold tracking-widest text-slate-400 uppercase">
        {label}
      </div>
      <div className="text-[24px] font-extrabold tabular-nums mt-0.5">
        {value}
        <span className="text-[12px] text-slate-400 font-semibold ml-1">
          {unit}
        </span>
      </div>
      <div className={`text-[11px] mt-1 font-semibold ${color}`}>
        {delta.text}
      </div>
    </div>
  );
}

function CardTitle({ title, tag }: { title: string; tag?: string }) {
  return (
    <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
      {title}
      {tag && (
        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          {tag}
        </span>
      )}
    </h2>
  );
}
