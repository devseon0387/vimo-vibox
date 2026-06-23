"use client";

import { X } from "lucide-react";

export type UploadState = {
  files: File[];
  sent: number;
  total: number;
  startedAt: number;
  peakBytesPerSec?: number;
  chunksByShard?: Record<string, number>;
};

function formatBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let n = b, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function UploadProgress({
  state,
  onCancel,
}: {
  state: UploadState | null;
  onCancel: () => void;
}) {
  if (!state) return null;
  const pct = state.total > 0 ? Math.min(100, (state.sent / state.total) * 100) : 0;
  const elapsed = (Date.now() - state.startedAt) / 1000;
  const speed = elapsed > 0 ? state.sent / elapsed : 0;
  const remaining = speed > 0 ? (state.total - state.sent) / speed : 0;

  const peak = state.peakBytesPerSec ?? 0;
  const shardEntries = Object.entries(state.chunksByShard ?? {});

  return (
    <div className="fixed bottom-6 right-6 w-[360px] bg-white border border-border rounded-lg shadow-xl z-40 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="text-base font-bold">
          업로드 중 ({state.files.length}개 파일)
        </div>
        <button
          onClick={onCancel}
          title="취소"
          className="p-1 rounded hover:bg-danger-soft text-text-soft hover:text-danger"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>

      <div className="p-4">
        <div className="text-sm text-text-muted mb-2 truncate">
          {state.files[0]?.name}
          {state.files.length > 1 && ` 외 ${state.files.length - 1}개`}
        </div>

        <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-text-faint font-mono">
          <span>
            {formatBytes(state.sent)} / {formatBytes(state.total)}
          </span>
          <span>
            {pct.toFixed(0)}%
            {speed > 0 && pct < 100 && (
              <span className="ml-2">
                {formatBytes(speed)}/s · {Math.ceil(remaining)}초
              </span>
            )}
          </span>
        </div>

        {/* 진단 정보 — 피크 속도 · 샤드 분포 */}
        {(peak > 0 || shardEntries.length > 0) && (
          <div className="mt-3 pt-2.5 border-t border-[#f0f0f0] text-2xs text-text-faint font-mono flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              {peak > 0 && (
                <span>
                  peak <span className="text-accent font-bold">{formatBytes(peak)}/s</span>
                </span>
              )}
            </span>
            {shardEntries.length > 0 && (
              <span className="flex items-center gap-1.5 flex-wrap justify-end">
                {shardEntries.map(([k, v]) => (
                  <span
                    key={k}
                    className={`px-1.5 py-0.5 rounded ${
                      k === "main"
                        ? "bg-accent-soft text-accent"
                        : "bg-success-soft text-success"
                    }`}
                  >
                    {k}×{v}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
