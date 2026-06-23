"use client";

import { useState, useMemo, useEffect } from "react";
import { Upload, Share2, Download, Filter } from "lucide-react";
import type { ActivityEntry, ActivityKind } from "@/lib/admin-activity";

const KIND_META: Record<ActivityKind, {
  label: string;
  icon: typeof Upload;
  cls: string;
  bgCls: string;
}> = {
  upload: { label: "업로드", icon: Upload, cls: "text-success", bgCls: "bg-success-soft" },
  share: { label: "공유", icon: Share2, cls: "text-accent", bgCls: "bg-accent-soft" },
  download: { label: "다운로드", icon: Download, cls: "text-purple", bgCls: "bg-purple-soft" },
};

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const counts = useMemo(() => {
    const c: Record<ActivityKind | "all", number> = {
      all: entries.length,
      upload: 0,
      share: 0,
      download: 0,
    };
    for (const e of entries) c[e.kind] += 1;
    return c;
  }, [entries]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.kind === filter)),
    [entries, filter],
  );

  // mount 후에만 client timezone으로 그룹화 (SSR/CSR 시간대 불일치 hydrate mismatch 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const grouped = useMemo(() => {
    if (!mounted) return [];
    const byDay = new Map<string, ActivityEntry[]>();
    for (const e of visible) {
      const d = new Date(e.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }
    return Array.from(byDay.entries());
  }, [visible, mounted]);

  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        <Filter size={13} strokeWidth={2.2} className="text-text-faint" />
        {(["all", "upload", "share", "download"] as const).map((k) => {
          const meta = k === "all" ? null : KIND_META[k];
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                active
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-text-soft border-border hover:bg-surface"
              }`}
            >
              {meta && <meta.icon size={11} strokeWidth={2.2} />}
              <span>{k === "all" ? "전체" : meta?.label}</span>
              <span className={`text-2xs ${active ? "text-white/80" : "text-text-faint"}`}>
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="border border-border rounded-xl bg-white px-6 py-16 text-center text-text-faint text-base">
          기록된 활동이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-semibold text-text-faint uppercase tracking-widest mb-2">
                {dayLabel(day)} · {items.length}건
              </div>
              <div className="border border-border rounded-xl bg-white divide-y divide-border overflow-hidden">
                {items.map((e, i) => {
                  const m = KIND_META[e.kind];
                  return (
                    <div key={`${day}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <div
                        className={`w-7 h-7 rounded-full grid place-items-center ${m.bgCls} ${m.cls} shrink-0`}
                      >
                        <m.icon size={13} strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${m.cls}`}>
                            {m.label}
                          </span>
                          {e.actorName && (
                            <span className="text-xs text-text-soft">
                              by {e.actorName}
                            </span>
                          )}
                          {e.meta && (
                            <span className="text-xs text-text-faint">{e.meta}</span>
                          )}
                        </div>
                        <div className="text-sm text-text font-mono truncate">
                          {e.path}
                        </div>
                      </div>
                      <div className="text-xs text-text-faint shrink-0">
                        {timeOnly(e.at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function dayLabel(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - date.getTime()) / 86400_000;
  const dow = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  if (diff === 0) return `오늘 (${dow})`;
  if (diff === 1) return `어제 (${dow})`;
  return `${m}월 ${d}일 (${dow})`;
}

function timeOnly(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
