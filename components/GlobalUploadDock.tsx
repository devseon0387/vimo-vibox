"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Copy,
  RotateCw,
} from "lucide-react";
import { useUpload, isVideoFile, type UploadEntry } from "@/lib/upload-store";
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

const RING_C = 100.5; // 2 * PI * 16

export function GlobalUploadDock() {
  const { uploads, summary, cancel, dismiss, retry } = useUpload();
  const [expanded, setExpanded] = useState(true);

  if (uploads.length === 0) return null;

  const single = uploads.length === 1;

  const headerLabel = (() => {
    if (summary.runningCount === 0) {
      const done = uploads.filter((u) => u.status === "done").length;
      const failed = uploads.filter((u) => u.status === "failed").length;
      if (failed > 0) return `${failed}개 실패`;
      if (done > 0) return `${done}개 완료`;
      return "완료";
    }
    return `업로드 ${summary.runningCount}건`;
  })();

  return (
    <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] right-4 md:bottom-6 md:right-6 w-[min(92vw,344px)] z-40">
      <div
        className="bg-white border border-[#efefef] overflow-hidden"
        style={{
          borderRadius: 16,
          boxShadow:
            "0 1px 3px rgba(0,0,0,.05),0 16px 36px -16px rgba(0,0,0,.24)",
        }}
      >
        {/* 헤더 — 여러 건일 때만 */}
        {!single && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[#fafafa] transition-colors"
            >
              <span className="flex-1 text-left text-sm font-bold text-[#18181b] truncate">
                {headerLabel}
              </span>
              {summary.runningCount > 0 && summary.total > 0 && (
                <span className="text-2xs text-[#a1a1aa] tabular-nums">
                  {Math.round(summary.pct)}%
                </span>
              )}
              <span className="shrink-0 text-[#a1a1aa]">
                {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </span>
            </button>
            <div className="h-px bg-[#f4f4f4]" />
          </>
        )}

        {(single || expanded) && (
          <div className="divide-y divide-[#f5f5f5]">
            {uploads.map((u) => (
              <UploadRow
                key={u.id}
                entry={u}
                onCancel={() => cancel(u.id)}
                onDismiss={() => dismiss(u.id)}
                onRetry={() => retry(u.id)}
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
  onRetry,
}: {
  entry: UploadEntry;
  onCancel: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const pct = entry.total > 0 ? Math.min(100, (entry.sent / entry.total) * 100) : 0;
  const elapsed = (Date.now() - entry.startedAt) / 1000;
  const speed = elapsed > 0 ? entry.sent / elapsed : 0;
  const remaining = speed > 0 ? (entry.total - entry.sent) / speed : 0;

  const firstName = entry.files[0]?.name ?? "";
  const moreCount = entry.fileCount - 1;
  const name = firstName + (moreCount > 0 ? ` 외 ${moreCount}개` : "");

  const st = entry.status;
  const isVid = entry.files[0] ? isVideoFile(entry.files[0]) : false;

  const ringPct = st === "done" ? 100 : pct;
  const ringOffset = RING_C * (1 - Math.min(1, ringPct / 100));
  const ringColor =
    st === "failed"
      ? "#dc2626"
      : st === "done"
        ? "#16a34a"
        : st === "cancelled"
          ? "#a1a1aa"
          : "#e85008";
  const tileBg =
    st === "failed"
      ? "#fef2f2"
      : st === "done"
        ? "#ecfdf3"
        : st === "cancelled"
          ? "#f4f4f5"
          : "#fdf1ea";

  return (
    <div className="group flex items-center gap-[13px] px-4 py-[15px]">
      {/* 링 타일 */}
      <div className="relative shrink-0" style={{ width: 46, height: 46 }}>
        <svg
          width="46"
          height="46"
          viewBox="0 0 36 36"
          className="absolute inset-0"
        >
          {st !== "done" && (
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#f0f0f0"
              strokeWidth="2.5"
            />
          )}
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={ringColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 18 18)"
            style={{ transition: "stroke-dashoffset .3s ease" }}
          />
        </svg>
        <div
          className="absolute grid place-items-center rounded-full"
          style={{ inset: 5, background: tileBg }}
        >
          {st === "done" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : st === "failed" ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          ) : isVid ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ringColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ringColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6" />
            </svg>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-semibold text-[#18181b]">
          {name}
        </div>
        <div
          className="text-2xs mt-[3px] tabular-nums truncate"
          style={{ color: st === "failed" ? "#dc2626" : "#a1a1aa" }}
          title={st === "failed" ? humanError(entry.error ?? "", "upload") : undefined}
        >
          {st === "running" &&
            `${formatBytes(entry.sent)} / ${formatBytes(entry.total)} · ${formatBytes(speed)}/s${
              pct < 100 && speed > 0 ? ` · ${Math.ceil(remaining)}초 남음` : ""
            }`}
          {st === "done" && (isVid ? "올림 · 미리보기로 공유됨" : "올림")}
          {st === "failed" && `업로드 실패 · ${humanError(entry.error ?? "", "upload")}`}
          {st === "cancelled" && "취소됨"}
        </div>
      </div>

      {/* 우측 액션 */}
      {st === "running" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="tabular-nums text-xs font-bold text-[#52525b]">
            {Math.round(pct)}%
          </span>
          <button
            onClick={onCancel}
            title="취소"
            className="opacity-0 group-hover:opacity-100 transition-opacity w-[26px] h-[26px] grid place-items-center rounded-md text-[#a1a1aa] hover:bg-[#f4f4f5] hover:text-[#71717a]"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {st === "failed" && (
        <button
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-[5px] text-xs font-bold text-[#e85008] bg-[#fdf1ea] rounded-[9px] px-[11px] py-[7px] hover:brightness-95 transition-[filter]"
        >
          <RotateCw size={13} strokeWidth={2.2} />
          재시도
        </button>
      )}

      {st === "done" && isVid && <DoneShare entry={entry} />}
      {st === "done" && !isVid && (
        <button
          onClick={onDismiss}
          title="닫기"
          className="shrink-0 w-[26px] h-[26px] grid place-items-center rounded-md text-[#a1a1aa] hover:bg-[#f4f4f5] hover:text-[#71717a]"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

// 업로드된 단일 영상에 자동 생성된 공유 링크 — 컴포넌트 리마운트 시 중복 생성 차단용 캐시.
const autoShareCache = new Map<string, { id: string; token: string }>();

/** 완료된 단일 영상 → 미리보기 공유 링크 자동 생성 + "링크 복사" 칩 (완료 2). */
function DoneShare({ entry }: { entry: UploadEntry }) {
  const filePath = useMemo(() => {
    const base = entry.targetPath.replace(/\/+$/, "");
    return `${base}/${entry.files[0]?.name ?? ""}`;
  }, [entry.targetPath, entry.files]);

  const cached = autoShareCache.get(entry.id);
  const [phase, setPhase] = useState<"creating" | "ready" | "error">(
    cached ? "ready" : "creating",
  );
  const [token, setToken] = useState<string | null>(cached?.token ?? null);
  const [copied, setCopied] = useState(false);
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    if (autoShareCache.has(entry.id)) return; // 리마운트 — 위 초기값으로 복원됨
    void (async () => {
      try {
        const res = await fetch("/api/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, mode: "preview" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.token || !body?.id) {
          setPhase("error");
          return;
        }
        autoShareCache.set(entry.id, { id: body.id, token: body.token });
        setToken(body.token);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    if (!token) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    try {
      await navigator.clipboard.writeText(`${origin}/s/${token}`);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (phase === "creating") {
    return (
      <span className="shrink-0 text-2xs text-[#a1a1aa]">링크 준비 중…</span>
    );
  }
  if (phase === "error" || !token) return null;

  return (
    <button
      onClick={copy}
      className="shrink-0 inline-flex items-center gap-[5px] text-xs font-bold rounded-[9px] px-[11px] py-[7px] transition-[filter] hover:brightness-95"
      style={{
        color: copied ? "#16a34a" : "#e85008",
        background: copied ? "#ecfdf3" : "#fdf1ea",
      }}
    >
      {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2.2} />}
      {copied ? "복사됨" : "링크 복사"}
    </button>
  );
}
