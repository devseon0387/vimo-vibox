"use client";

import { useMemo, useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  CircleAlert,
  Copy,
  Download,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type Item = {
  id: string;
  commentId: string;
  filePath: string;
  reporterName: string;
  verdict: string;
  reasonTag: string | null;
  note: string | null;
  aiBody: string | null;
  aiSuggestion: string | null;
  aiOcrWrong: string | null;
  videoTimeMs: number | null;
  createdAt: number;
};

const REASON_LABELS: Record<string, string> = {
  ocr_misread: "OCR 오인식",
  wrong_correction: "수정 제안 틀림",
  context_wrong: "문맥상 원문이 맞음",
  not_a_typo: "오타 아님",
  partial_fix: "일부만 맞음",
  other: "기타",
};

function formatTc(ms: number | null): string {
  if (ms == null) return "--:--";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatRel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "방금 전";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}시간 전`;
  return new Date(ts).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function AiFeedbackAdminView({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<"all" | "good" | "bad" | "partial">("all");

  const stats = useMemo(() => {
    const s = {
      total: items.length,
      good: 0,
      bad: 0,
      partial: 0,
      byReason: {} as Record<string, number>,
    };
    for (const it of items) {
      if (it.verdict === "good") s.good++;
      else if (it.verdict === "bad") s.bad++;
      else if (it.verdict === "partial") s.partial++;
      if (it.reasonTag) {
        s.byReason[it.reasonTag] = (s.byReason[it.reasonTag] ?? 0) + 1;
      }
    }
    return s;
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((it) => it.verdict === filter);
  }, [items, filter]);

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            stats,
            items: items.map((it) => ({
              verdict: it.verdict,
              reasonTag: it.reasonTag,
              note: it.note,
              ocrWrong: it.aiOcrWrong,
              suggestion: it.aiSuggestion,
              aiBody: it.aiBody,
              filePath: it.filePath,
              videoTimeMs: it.videoTimeMs,
              reporter: it.reporterName,
              at: it.createdAt,
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyForClaude = async () => {
    const lines: string[] = [];
    lines.push("# AI 검수 피드백 데이터");
    lines.push("");
    lines.push(
      `총 ${stats.total}건 · 정확 ${stats.good} · 부정확 ${stats.bad} · 부분 ${stats.partial}`,
    );
    lines.push("");
    lines.push("## 사유별");
    for (const [tag, c] of Object.entries(stats.byReason)) {
      lines.push(`- ${REASON_LABELS[tag] ?? tag}: ${c}건`);
    }
    lines.push("");
    lines.push("## 케이스별 (부정확·부분만)");
    lines.push("");
    for (const it of items.filter((i) => i.verdict !== "good")) {
      const tag = it.reasonTag ? REASON_LABELS[it.reasonTag] ?? it.reasonTag : "";
      lines.push(
        `- ${it.filePath} @${formatTc(it.videoTimeMs)} — "${it.aiOcrWrong ?? "?"}" → "${it.aiSuggestion ?? "?"}"`,
      );
      lines.push(`  - 라벨: ${it.verdict}${tag ? ` (${tag})` : ""}`);
      if (it.note) lines.push(`  - 메모: ${it.note}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1200px]">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" strokeWidth={2.3} />
            AI 검수 피드백
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            누적 사용자 평가 — Claude 에 붙여넣어 검수 로직 개선 분석에 활용
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyForClaude}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded border border-slate-200 bg-white hover:bg-slate-50"
            title="요약 markdown 으로 클립보드 복사 — Claude 에 붙여넣기"
          >
            <Copy size={12} strokeWidth={2.3} />
            Claude 용 복사
          </button>
          <button
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            <Download size={12} strokeWidth={2.3} />
            JSON 내보내기
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`text-left p-3 rounded-lg border bg-white ${filter === "all" ? "border-slate-900" : "border-slate-200"}`}
        >
          <div className="text-xs text-text-muted">전체</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </button>
        <button
          onClick={() => setFilter("good")}
          className={`text-left p-3 rounded-lg border bg-white ${filter === "good" ? "border-emerald-600" : "border-slate-200"}`}
        >
          <div className="text-xs text-text-muted inline-flex items-center gap-1">
            <ThumbsUp size={10} className="text-emerald-600" />
            정확
          </div>
          <div className="text-2xl font-bold text-emerald-700">
            {stats.good}
          </div>
        </button>
        <button
          onClick={() => setFilter("bad")}
          className={`text-left p-3 rounded-lg border bg-white ${filter === "bad" ? "border-rose-600" : "border-slate-200"}`}
        >
          <div className="text-xs text-text-muted inline-flex items-center gap-1">
            <ThumbsDown size={10} className="text-rose-600" />
            부정확
          </div>
          <div className="text-2xl font-bold text-rose-700">{stats.bad}</div>
        </button>
        <button
          onClick={() => setFilter("partial")}
          className={`text-left p-3 rounded-lg border bg-white ${filter === "partial" ? "border-amber-600" : "border-slate-200"}`}
        >
          <div className="text-xs text-text-muted inline-flex items-center gap-1">
            <CircleAlert size={10} className="text-amber-600" />
            부분
          </div>
          <div className="text-2xl font-bold text-amber-700">
            {stats.partial}
          </div>
        </button>
      </div>

      {/* 사유 분포 */}
      {Object.keys(stats.byReason).length > 0 && (
        <div className="mb-5 p-3 rounded-lg border border-slate-200 bg-white">
          <div className="text-xs font-bold text-text-muted mb-1.5">
            부정확 사유 분포
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(stats.byReason)
              .sort((a, b) => b[1] - a[1])
              .map(([tag, c]) => (
                <Badge key={tag} tone="neutral" size="md">
                  {REASON_LABELS[tag] ?? tag}
                  <span className="font-bold text-slate-900">{c}</span>
                </Badge>
              ))}
          </div>
        </div>
      )}

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center bg-white">
          <div className="text-base text-text-muted">아직 피드백이 없습니다</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((it) => {
            const isGood = it.verdict === "good";
            const isBad = it.verdict === "bad";
            const verdictTone = isGood ? "success" : isBad ? "danger" : "warning";
            const VerdictIcon = isGood
              ? ThumbsUp
              : isBad
                ? ThumbsDown
                : CircleAlert;
            return (
              <div
                key={it.id}
                className="p-3 rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge tone={verdictTone} size="sm" icon={VerdictIcon}>
                    {it.reasonTag
                      ? REASON_LABELS[it.reasonTag] ?? it.reasonTag
                      : isGood
                        ? "정확"
                        : "부정확"}
                  </Badge>
                  <span className="font-mono text-2xs text-text-muted">
                    {formatTc(it.videoTimeMs)}
                  </span>
                  <span className="text-xs text-slate-600 truncate flex-1">
                    {it.filePath}
                  </span>
                  <span className="text-2xs text-text-muted">
                    {it.reporterName} · {formatRel(it.createdAt)}
                  </span>
                </div>
                {(it.aiOcrWrong || it.aiSuggestion) && (
                  <div className="text-sm font-medium text-slate-900 mb-1">
                    “{it.aiOcrWrong ?? "?"}”{" "}
                    <span className="text-slate-300 mx-0.5">→</span>{" "}
                    <span className="text-orange-600">
                      “{it.aiSuggestion ?? "?"}”
                    </span>
                  </div>
                )}
                {it.aiBody && (
                  <div className="text-xs text-text-muted">{it.aiBody}</div>
                )}
                {it.note && (
                  <div className="mt-1.5 p-1.5 bg-slate-50 rounded text-sm text-slate-700">
                    “{it.note}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
