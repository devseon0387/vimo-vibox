"use client";

import Link from "next/link";
import { Heart, TrendingUp, MessageSquare, Check, Brain } from "lucide-react";
import {
  CategoryIcon,
  CategoryIconBox,
} from "./CategoryIcon";
import {
  CATEGORIES,
  getCategoryMeta,
  PRAISE_COLOR,
  PRAISE_BG,
  type Category,
} from "@/lib/comments/detect";
import type {
  PraiseItem,
  FeedbackPatternRow,
  Stats,
} from "@/app/(app)/insights/page";

function formatTc(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  const d = Math.floor(diff / 86400_000);
  if (d < 7) return `${d}일 전`;
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function InsightsView({
  stats,
  praise,
  patterns,
  accuracy,
}: {
  stats: Stats;
  praise: PraiseItem[];
  patterns: FeedbackPatternRow[];
  accuracy: { total: number; catMatch: number; kindMatch: number };
}) {
  // 좋아요를 카테고리별로 그룹핑
  const praiseByCategory = new Map<Category, PraiseItem[]>();
  for (const p of praise) {
    const arr = praiseByCategory.get(p.category) ?? [];
    arr.push(p);
    praiseByCategory.set(p.category, arr);
  }

  const catAccPct =
    accuracy.total > 0
      ? Math.round((accuracy.catMatch / accuracy.total) * 100)
      : 0;
  const kindAccPct =
    accuracy.total > 0
      ? Math.round((accuracy.kindMatch / accuracy.total) * 100)
      : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">인사이트</h1>
        <p className="text-sm text-text-faint mt-1">
          팀 전체의 좋아요와 수정 패턴을 한눈에
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<MessageSquare size={16} strokeWidth={2.2} />}
          label="전체 댓글"
          value={stats.total}
          tone="neutral"
        />
        <StatCard
          icon={<Heart size={16} strokeWidth={2.2} fill={PRAISE_COLOR} />}
          label="좋아요"
          value={stats.praise}
          tone="success"
        />
        <StatCard
          icon={<TrendingUp size={16} strokeWidth={2.2} />}
          label="미해결 수정"
          value={stats.unresolved}
          tone={stats.unresolved > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<Check size={16} strokeWidth={2.2} />}
          label="해결됨"
          value={stats.resolved}
          tone="neutral"
        />
      </div>

      {/* 자동 감지 정확도 (학습 지표) */}
      {accuracy.total > 5 && (
        <div className="mb-6 bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <Brain size={18} className="text-accent" strokeWidth={2} />
          <div className="text-sm text-text-soft">
            자동 분류 정확도:{" "}
            <span className="font-bold text-text">
              카테고리 {catAccPct}%
            </span>
            {" · "}
            <span className="font-bold text-text">종류 {kindAccPct}%</span>
          </div>
          <span className="text-xs text-text-faint ml-auto">
            {accuracy.total}개 샘플 기반
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좋아요 모음 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Heart
                size={14}
                strokeWidth={2.2}
                fill={PRAISE_COLOR}
                className="text-green-600"
                style={{ color: PRAISE_COLOR }}
              />
              좋아요 모음
            </h2>
            <span className="text-xs text-text-faint">
              팀이 잘한 포인트
            </span>
          </div>

          {praise.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-10 text-center">
              <Heart
                size={24}
                className="mx-auto text-text-faint mb-2"
                strokeWidth={1.5}
              />
              <div className="text-base text-text-muted">
                아직 좋아요가 없어요
              </div>
              <div className="text-xs text-text-faint mt-1">
                영상 피드백에서 "좋아요" 모드로 남길 수 있어요
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {CATEGORIES.map((cat) => {
                const list = praiseByCategory.get(cat.key);
                if (!list || list.length === 0) return null;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: cat.color }}>
                      <CategoryIcon category={cat.key} size={11} stroke={2.5} />
                      {cat.label}
                      <span className="text-text-faint font-medium">{list.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {list.map((p) => (
                        <li
                          key={p.id}
                          className="bg-white border border-border rounded-lg p-3 hover:border-border-hover transition-colors"
                          style={{ background: PRAISE_BG + "40" }}
                        >
                          <div className="text-base text-text leading-[1.5] mb-1.5">
                            {p.body}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-faint flex-wrap">
                            <Link
                              href={`/?path=${encodeURIComponent(p.filePath.split("/").slice(0, -1).join("/") || "/")}`}
                              className="hover:text-text truncate max-w-[240px]"
                              title={p.filePath}
                            >
                              {basename(p.filePath)}
                            </Link>
                            <span
                              className="font-mono"
                              style={{ color: PRAISE_COLOR }}
                            >
                              {formatTc(p.videoTimeMs)}
                            </span>
                            <span>{p.authorName}</span>
                            <span className="ml-auto">
                              {formatRelative(p.createdAt)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 수정 패턴 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp size={14} strokeWidth={2.2} />
              반복되는 수정 패턴
            </h2>
            <span className="text-xs text-text-faint">
              카테고리별 빈도
            </span>
          </div>

          {patterns.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-10 text-center">
              <div className="text-base text-text-muted">
                아직 수정 요청이 없어요
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {patterns.map((p) => {
                const meta = getCategoryMeta(p.category);
                return (
                  <div
                    key={p.category}
                    className="border border-border rounded-lg overflow-hidden bg-white"
                  >
                    <div
                      className="px-4 py-2.5 flex items-center gap-2.5 border-b border-border-soft"
                      style={{ background: meta.bgSoft }}
                    >
                      <CategoryIconBox category={p.category} size={26} />
                      <div className="flex-1">
                        <div
                          className="text-base font-bold"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </div>
                        <div className="text-xs text-text-faint">
                          총 {p.total}건
                          {p.unresolved > 0 && (
                            <>
                              {" · "}
                              <span className="text-warning font-semibold">
                                미해결 {p.unresolved}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* 시각적 바 */}
                      <div className="flex gap-0.5 items-end h-4">
                        {Array.from({ length: Math.min(p.total, 10) }).map(
                          (_, i) => (
                            <span
                              key={i}
                              className="w-1 rounded-sm"
                              style={{
                                background: meta.color,
                                height: `${20 + i * 3}%`,
                                opacity: i < p.unresolved ? 1 : 0.3,
                              }}
                            />
                          ),
                        )}
                      </div>
                    </div>
                    <ul className="divide-y divide-border-soft">
                      {p.recent.slice(0, 3).map((r) => (
                        <li
                          key={r.id}
                          className="px-4 py-2.5 flex items-start gap-2"
                        >
                          <span
                            className="font-mono text-xs font-semibold shrink-0 mt-0.5"
                            style={{ color: meta.color }}
                          >
                            {formatTc(r.videoTimeMs)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm leading-[1.5] ${
                                r.resolved
                                  ? "text-text-faint line-through"
                                  : "text-text"
                              }`}
                            >
                              {r.body}
                            </div>
                            <div className="text-2xs text-text-faint mt-0.5 truncate">
                              {basename(r.filePath)} · {r.authorName}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
}) {
  const toneCls: Record<string, string> = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-warning",
  };
  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-text-faint font-semibold mb-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-[24px] font-bold ${toneCls[tone]}`}>{value}</div>
    </div>
  );
}
