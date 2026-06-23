"use client";

import { useState } from "react";
import {
  Sparkles,
  Wrench,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ChangelogEntry, UpdateType } from "@/lib/changelog";

const TYPE_CONFIG: Record<
  UpdateType,
  { label: string; bg: string; color: string; icon: React.ReactNode }
> = {
  feature: {
    label: "신기능",
    bg: "bg-accent-soft",
    color: "text-accent",
    icon: <Sparkles size={11} strokeWidth={2.5} />,
  },
  improvement: {
    label: "개선",
    bg: "bg-blue-50",
    color: "text-blue-600",
    icon: <TrendingUp size={11} strokeWidth={2.5} />,
  },
  fix: {
    label: "버그수정",
    bg: "bg-amber-50",
    color: "text-amber-700",
    icon: <Wrench size={11} strokeWidth={2.5} />,
  },
  breaking: {
    label: "주의",
    bg: "bg-danger-soft",
    color: "text-danger",
    icon: <AlertTriangle size={11} strokeWidth={2.5} />,
  },
};

export function ChangelogTimeline({
  entries,
}: {
  entries: ChangelogEntry[];
}) {
  // 최신 1개는 default expanded
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(entries[0] ? [entries[0].id] : []),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-text-faint border border-dashed border-border rounded-xl">
        <p className="font-medium">아직 기록이 없어요</p>
        <p className="text-sm mt-1">
          <code className="bg-surface px-1.5 py-0.5 rounded">
            lib/changelog.ts
          </code>{" "}
          에 entry 추가
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((item) => {
        const cfg = TYPE_CONFIG[item.type];
        const isOpen = expanded.has(item.id);
        const hasDetails =
          (item.features && item.features.length > 0) ||
          (item.fixes && item.fixes.length > 0) ||
          (item.details && item.details.length > 0);
        return (
          <div
            key={item.id}
            className="bg-white border border-border rounded-xl overflow-hidden hover:border-border-hover transition-colors"
          >
            <button
              type="button"
              onClick={() => hasDetails && toggle(item.id)}
              className={`w-full flex items-start gap-4 p-5 text-left ${
                hasDetails ? "cursor-pointer hover:bg-surface" : "cursor-default"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-sm font-bold text-text-faint font-mono">
                    {item.version}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${cfg.bg} ${cfg.color}`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                  <span className="text-xs text-text-faint">
                    {item.date}
                  </span>
                </div>
                <h3 className="text-md font-bold text-text leading-snug">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-sm text-text-soft mt-1 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
              {hasDetails && (
                <div className="shrink-0 text-text-faint mt-1">
                  {isOpen ? (
                    <ChevronUp size={16} strokeWidth={2.2} />
                  ) : (
                    <ChevronDown size={16} strokeWidth={2.2} />
                  )}
                </div>
              )}
            </button>

            {isOpen && hasDetails && (
              <div className="px-5 pb-5 border-t border-border bg-[#fafafa]">
                {item.features && item.features.length > 0 && (
                  <DetailGroup
                    title="추가 / 개선"
                    color="text-accent"
                    items={item.features}
                  />
                )}
                {item.fixes && item.fixes.length > 0 && (
                  <DetailGroup
                    title="수정"
                    color="text-amber-700"
                    items={item.fixes}
                  />
                )}
                {item.details && item.details.length > 0 && (
                  <DetailGroup
                    title="상세"
                    color="text-text-soft"
                    items={item.details}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailGroup({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: string[];
}) {
  return (
    <div className="mt-4">
      <div
        className={`text-2xs font-bold uppercase tracking-wider mb-2 ${color}`}
      >
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-text leading-relaxed"
          >
            <span
              className={`mt-1.5 w-1 h-1 rounded-full bg-current shrink-0 ${color}`}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
