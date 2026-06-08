"use client";

import { FolderOpen, Clock, Star, Trash2, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { MenuSection, MenuItem } from "./MenuShell";

type Usage = { usedBytes: number; quotaBytes: number; pct: number; fileCount: number };

function formatBytes(b: number | null | undefined): string {
  if (!b || b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(b) / 3));
  return `${(b / Math.pow(1000, i)).toFixed(i <= 1 ? 0 : 1)} ${u[i]}`;
}

export function MyboxMenu({ isPartner = false }: { isPartner?: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/my/box/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!cancelled && u) setUsage(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* 사용량 게이지 — /api/my/box/usage 실데이터 */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between text-[11px] text-text-faint mb-1.5">
          <span>스토리지</span>
          <span>
            {usage
              ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.quotaBytes)}`
              : "—"}
          </span>
        </div>
        <div className="h-1 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{
              width: usage ? `${Math.min(100, usage.pct * 100)}%` : "0%",
              background: "var(--personal, var(--accent))",
            }}
          />
        </div>
      </div>

      <MenuSection label="바로가기" />
      <MenuItem href="/my/box" icon={FolderOpen} label="모든 파일" />
      <MenuItem href="/my/box?recent=1" icon={Clock} label="최근" />
      <MenuItem href="/my/box?starred=1" icon={Star} label="즐겨찾기" />

      {/* 파트너는 내부 영역(내 기록·휴지통) 숨김 */}
      {!isPartner && (
        <>
          <MenuSection label="기록" />
          <MenuItem href="/my/stats" icon={Activity} label="내 기록" />

          <MenuSection label="기타" />
          <MenuItem href="/trash" icon={Trash2} label="휴지통" />
        </>
      )}
    </>
  );
}
