"use client";

import { useEffect, useState } from "react";
import type { HealthSnapshot } from "@/lib/health";

type StatusBarProps = {
  entriesCount: number;
  folderCount: number;
  fileCount: number;
  selectedCount: number;
  /** admin/member 일 때만 health polling */
  canSeeHealth: boolean;
};

type Health = {
  litestreamOk: boolean;
  litestreamAgeText: string | null;
  diskPct: number | null;
  diskLabel: string | null;
  mirrorWarn: boolean;
  mirrorText: string | null;
};

function summarize(snap: HealthSnapshot): Health {
  const ls = snap.litestream;
  const litestreamOk = ls.launchdLoaded && ls.processAlive;
  let litestreamAgeText: string | null = null;
  if (ls.lastBackupAt) {
    const diff = Date.now() - ls.lastBackupAt;
    if (diff < 60_000) litestreamAgeText = "방금";
    else if (diff < 3_600_000) litestreamAgeText = `${Math.floor(diff / 60_000)}분 전`;
    else if (diff < 86_400_000) litestreamAgeText = `${Math.floor(diff / 3_600_000)}시간 전`;
    else litestreamAgeText = `${Math.floor(diff / 86_400_000)}일 전`;
  }

  // 가장 사용량 많은 hot 볼륨 기준
  const hot = snap.volumes.filter((v) => v.tier === "hot" && v.mounted);
  let diskPct: number | null = null;
  let diskLabel: string | null = null;
  if (hot.length > 0) {
    const v = hot.sort((a, b) => b.usedBytes / b.totalBytes - a.usedBytes / a.totalBytes)[0];
    if (v.totalBytes > 0) {
      diskPct = Math.round((v.usedBytes / v.totalBytes) * 100);
      diskLabel = v.label;
    }
  }

  let mirrorWarn = false;
  let mirrorText: string | null = null;
  if (snap.mirror) {
    if (snap.mirror.latestAt) {
      const diff = Date.now() - snap.mirror.latestAt;
      const days = Math.floor(diff / 86_400_000);
      if (days >= 2) mirrorWarn = true;
      mirrorText = days === 0 ? "오늘" : days === 1 ? "어제" : `${days}일 전`;
    } else {
      mirrorWarn = true;
      mirrorText = "기록 없음";
    }
  }

  return { litestreamOk, litestreamAgeText, diskPct, diskLabel, mirrorWarn, mirrorText };
}

export function StatusBar({
  entriesCount,
  folderCount,
  fileCount,
  selectedCount,
  canSeeHealth,
}: StatusBarProps) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    if (!canSeeHealth) return;
    const ac = new AbortController();
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/admin/health", {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const snap = (await res.json()) as HealthSnapshot;
        if (!ac.signal.aborted) setHealth(summarize(snap));
      } catch (e) {
        // AbortError (페이지 이동) 또는 네트워크 오류 — best effort
        if ((e as Error)?.name === "AbortError") return;
      }
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [canSeeHealth]);

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 mt-4 -mx-1 bg-white/95 backdrop-blur border border-border rounded-md px-3.5 py-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-text-soft shadow-[0_-1px_3px_rgba(0,0,0,0.03)]"
      role="status"
      aria-live="polite"
    >
      {/* Left: 항목 카운트 — 모바일은 폴더·파일 내역 생략 */}
      <span className="flex items-center gap-1">
        {selectedCount > 0 ? (
          <>
            <span className="font-semibold text-accent">{selectedCount}</span>
            <span>개 선택 / {entriesCount}개</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-text">{entriesCount}</span>
            <span>개 항목</span>
            <span className="hidden sm:inline">
              ({folderCount} 폴더 · {fileCount} 파일)
            </span>
          </>
        )}
      </span>

      {/* Health (admin/member만) */}
      {health && (
        <>
          <span className="hidden sm:block w-px h-3 bg-border" />
          <span className="flex items-center gap-1.5">
            <span
              title={health.litestreamOk ? "정상" : "실패"}
              className={`w-1.5 h-1.5 rounded-full ${health.litestreamOk ? "bg-success" : "bg-danger"}`}
            />
            <span>Litestream</span>
            {health.litestreamAgeText && (
              <span className="text-text-faint">({health.litestreamAgeText})</span>
            )}
          </span>
          {health.diskPct !== null && (
            <span className="flex items-center gap-1.5">
              <span
                title={health.diskPct >= 90 ? "위험" : health.diskPct >= 75 ? "주의" : "정상"}
                className={`w-1.5 h-1.5 rounded-full ${
                  health.diskPct >= 90
                    ? "bg-danger"
                    : health.diskPct >= 75
                      ? "bg-amber-500"
                      : "bg-success"
                }`}
              />
              <span>디스크 {health.diskPct}%</span>
            </span>
          )}
          {health.mirrorText && (
            <span className="flex items-center gap-1.5">
              <span
                title={health.mirrorWarn ? "주의" : "정상"}
                className={`w-1.5 h-1.5 rounded-full ${
                  health.mirrorWarn ? "bg-amber-500" : "bg-success"
                }`}
              />
              <span>미러 {health.mirrorText}</span>
            </span>
          )}
        </>
      )}

      {/* Right: 단축키 힌트 — 키보드 없는 모바일에선 숨김 */}
      <span className="ml-auto hidden md:flex items-center gap-2 text-text-faint">
        <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-2xs font-mono text-text-soft">
          ↑↓
        </kbd>
        <span>이동</span>
        <span className="opacity-40">·</span>
        <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-2xs font-mono text-text-soft">
          Space
        </kbd>
        <span>미리보기</span>
        <span className="opacity-40">·</span>
        <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-2xs font-mono text-text-soft">
          ↵
        </kbd>
        <span>열기</span>
        <span className="opacity-40">·</span>
        <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-2xs font-mono text-text-soft">
          ⌫
        </kbd>
        <span>삭제</span>
      </span>
    </div>
  );
}
