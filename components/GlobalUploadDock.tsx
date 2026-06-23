"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Upload,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  MinusCircle,
  Loader2,
} from "lucide-react";
import { useUpload, type UploadEntry } from "@/lib/upload-store";
import { humanError } from "@/lib/human-error";

function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = b;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function statusIcon(status: UploadEntry["status"]) {
  if (status === "running")
    return <Loader2 size={14} strokeWidth={2.2} className="text-accent animate-spin" />;
  if (status === "done")
    return <Check size={14} strokeWidth={2.5} className="text-emerald-600" />;
  if (status === "failed")
    return <AlertCircle size={14} strokeWidth={2.2} className="text-rose-600" />;
  return <MinusCircle size={14} strokeWidth={2.2} className="text-text-faint" />;
}

function pathLabel(p: string): string {
  if (p === "/" || p === "") return "렌더링";
  if (p.startsWith("/library")) return "자료실" + p.slice(8);
  if (p.startsWith("/personal/")) {
    const rest = p.split("/").slice(3).join("/");
    return "내 박스" + (rest ? "/" + rest : "");
  }
  return "렌더링" + p;
}

function pathHref(p: string): string {
  if (p === "/" || p === "") return "/";
  if (p.startsWith("/library")) {
    const sub = p.slice(8);
    return `/vimo-box/library${sub ? `?path=${encodeURIComponent(sub)}` : ""}`;
  }
  if (p.startsWith("/personal/")) {
    return "/my/box";
  }
  return `/?path=${encodeURIComponent(p)}`;
}

export function GlobalUploadDock() {
  const { uploads, summary, cancel, dismiss } = useUpload();
  const [expanded, setExpanded] = useState(true);

  if (uploads.length === 0) return null;

  const headerLabel = (() => {
    if (summary.runningCount === 0) {
      const done = uploads.filter((u) => u.status === "done").length;
      const failed = uploads.filter((u) => u.status === "failed").length;
      const cancelled = uploads.filter((u) => u.status === "cancelled").length;
      if (failed > 0) return `${failed}개 실패`;
      if (done > 0) return `${done}개 완료`;
      if (cancelled > 0) return `${cancelled}개 취소됨`;
      return "완료";
    }
    return `업로드 ${summary.runningCount}건`;
  })();

  return (
    <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-[min(92vw,380px)] z-40">
      <div className="bg-white border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border hover:bg-surface transition-colors"
        >
          {summary.runningCount > 0 ? (
            <Loader2 size={15} strokeWidth={2.2} className="text-accent animate-spin" />
          ) : (
            <Upload size={14} strokeWidth={2.2} className="text-text-soft" />
          )}
          <div className="flex-1 text-left min-w-0">
            <div className="text-[13px] font-bold text-text truncate">{headerLabel}</div>
            {summary.runningCount > 0 && summary.total > 0 && (
              <div className="text-[11px] text-text-faint mono tabular-nums truncate">
                {formatBytes(summary.sent)} / {formatBytes(summary.total)} ·{" "}
                {Math.round(summary.pct)}%
              </div>
            )}
          </div>
          <span className="shrink-0 text-text-soft">
            {expanded ? (
              <ChevronDown size={15} strokeWidth={2.2} />
            ) : (
              <ChevronUp size={15} strokeWidth={2.2} />
            )}
          </span>
        </button>

        {/* 진행률 바 (헤더 바로 아래) */}
        {summary.runningCount > 0 && (
          <div className="h-1 bg-surface">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
        )}

        {/* Expanded list */}
        {expanded && (
          <div className="max-h-[40vh] overflow-y-auto divide-y divide-[#f5f5f5]">
            {uploads.map((u) => (
              <UploadRow
                key={u.id}
                entry={u}
                onCancel={() => cancel(u.id)}
                onDismiss={() => dismiss(u.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadRow({
  entry,
  onCancel,
  onDismiss,
}: {
  entry: UploadEntry;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const pct = entry.total > 0 ? Math.min(100, (entry.sent / entry.total) * 100) : 0;
  const elapsed = (Date.now() - entry.startedAt) / 1000;
  const speed = elapsed > 0 ? entry.sent / elapsed : 0;
  const remaining = speed > 0 ? (entry.total - entry.sent) / speed : 0;

  const firstName = entry.files[0]?.name ?? "";
  const moreCount = entry.fileCount - 1;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{statusIcon(entry.status)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-text truncate font-medium">
            {firstName}
            {moreCount > 0 && (
              <span className="text-text-soft font-normal"> 외 {moreCount}개</span>
            )}
          </div>
          <div className="text-[11px] text-text-faint truncate flex items-center gap-1">
            <span>→</span>
            <Link
              href={pathHref(entry.targetPath)}
              className="hover:text-accent truncate"
              title={entry.targetPath}
            >
              {pathLabel(entry.targetPath)}
            </Link>
          </div>
        </div>
        {entry.status === "running" ? (
          <button
            onClick={onCancel}
            title="취소"
            className="shrink-0 p-1 rounded hover:bg-danger-soft text-text-soft hover:text-danger"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            onClick={onDismiss}
            title="알림 닫기"
            className="shrink-0 p-1 rounded hover:bg-hover text-text-soft hover:text-text"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {entry.status === "running" && (
        <>
          <div className="h-1 bg-surface rounded-full overflow-hidden mt-2 mb-1.5">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10.5px] text-text-faint mono tabular-nums">
            <span>
              {formatBytes(entry.sent)} / {formatBytes(entry.total)}
            </span>
            <span>
              {pct.toFixed(0)}%
              {speed > 0 && pct < 100 && (
                <>
                  {" · "}
                  {formatBytes(speed)}/s · {Math.ceil(remaining)}초
                </>
              )}
            </span>
          </div>
        </>
      )}

      {entry.status === "failed" && entry.error && (
        <div
          className="mt-1 text-[11px] text-rose-600 truncate"
          title={humanError(entry.error, "upload")}
        >
          {humanError(entry.error, "upload")}
        </div>
      )}
    </div>
  );
}
