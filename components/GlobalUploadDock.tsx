"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Link2,
  Copy,
  Eye,
  MessageSquare,
  Download,
  ExternalLink,
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
            <div className="text-base font-bold text-text truncate">{headerLabel}</div>
            {summary.runningCount > 0 && summary.total > 0 && (
              <div className="text-xs text-text-faint mono tabular-nums truncate">
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
          <div className="text-sm text-text truncate font-medium">
            {firstName}
            {moreCount > 0 && (
              <span className="text-text-soft font-normal"> 외 {moreCount}개</span>
            )}
          </div>
          <div className="text-xs text-text-faint truncate flex items-center gap-1">
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
          <div className="flex justify-between items-center text-2xs text-text-faint mono tabular-nums">
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
          className="mt-1 text-xs text-rose-600 truncate"
          title={humanError(entry.error, "upload")}
        >
          {humanError(entry.error, "upload")}
        </div>
      )}

      {/* 완료된 단일 영상 → 공유 링크 자동 생성 + 인라인 패널 */}
      {entry.status === "done" &&
        entry.fileCount === 1 &&
        entry.files[0] &&
        isVideoFile(entry.files[0]) && <UploadSharePanel entry={entry} />}
    </div>
  );
}

/** 업로드 직후 공유 모드 기본값 — 미리보기. 마지막 선택을 기억. */
function shareDefaultMode(): "preview" | "full" {
  try {
    return localStorage.getItem("vibox.shareDefaultMode") === "full"
      ? "full"
      : "preview";
  } catch {
    return "preview";
  }
}

// 업로드 항목별 자동 생성된 공유 링크를 모듈 스코프에 캐시(entry.id 기준).
// UploadSharePanel 이 네비게이션·router.refresh 로 리마운트되면 컴포넌트 ref(createdRef)는
// 리셋돼 같은 항목에 링크를 "또" 만든다 → 캐시로 중복 생성 차단 + 리마운트 시 상태 복원.
type AutoShare = {
  id: string;
  token: string;
  mode: "preview" | "full";
  allowDownload: boolean;
};
const autoShareCache = new Map<string, AutoShare>();

function UploadSharePanel({ entry }: { entry: UploadEntry }) {
  const filePath = useMemo(() => {
    const base = entry.targetPath.replace(/\/+$/, "");
    return `${base}/${entry.files[0]?.name ?? ""}`;
  }, [entry.targetPath, entry.files]);

  const cached = autoShareCache.get(entry.id);
  const [phase, setPhase] = useState<"creating" | "ready" | "error">(
    cached ? "ready" : "creating",
  );
  const [share, setShare] = useState<{ id: string; token: string } | null>(
    cached ? { id: cached.id, token: cached.token } : null,
  );
  const [mode, setMode] = useState<"preview" | "full">(cached?.mode ?? "preview");
  const [allowDownload, setAllowDownload] = useState(cached?.allowDownload ?? true);
  const [copied, setCopied] = useState(false);
  const createdRef = useRef(false);

  // 완료 시 공유 링크 1회 자동 생성 (기본 미리보기). 이미 캐시에 있으면(리마운트) 재생성하지 않음.
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    if (autoShareCache.has(entry.id)) return; // 리마운트 — 위 useState 초기값으로 이미 복원됨
    const initial = shareDefaultMode();
    setMode(initial);
    void (async () => {
      try {
        const res = await fetch("/api/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, mode: initial }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.token || !body?.id) {
          setPhase("error");
          return;
        }
        autoShareCache.set(entry.id, {
          id: body.id,
          token: body.token,
          mode: initial,
          allowDownload: true,
        });
        setShare({ id: body.id, token: body.token });
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const host =
    typeof window !== "undefined" ? window.location.host : "vibox.cloud";
  const shareUrl = share ? `${origin}/s/${share.token}` : "";
  const shortUrl = share ? `${host}/s/${share.token}` : "";

  const patch = async (changes: Record<string, unknown>) => {
    if (!share) return;
    try {
      await fetch(`/api/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
    } catch {}
  };

  const changeMode = (m: "preview" | "full") => {
    if (m === mode) return;
    setMode(m);
    const c = autoShareCache.get(entry.id);
    if (c) autoShareCache.set(entry.id, { ...c, mode: m });
    try {
      localStorage.setItem("vibox.shareDefaultMode", m);
    } catch {}
    void patch({ mode: m });
  };
  const toggleDownload = () => {
    const v = !allowDownload;
    setAllowDownload(v);
    const c = autoShareCache.get(entry.id);
    if (c) autoShareCache.set(entry.id, { ...c, allowDownload: v });
    void patch({ allowDownload: v });
  };
  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (phase === "creating") {
    return (
      <div className="mt-2.5 pt-2.5 border-t border-dashed border-border flex items-center gap-2 text-xs text-text-faint">
        <Loader2 size={13} strokeWidth={2.2} className="animate-spin text-accent" />
        공유 링크 만드는 중…
      </div>
    );
  }
  if (phase === "error" || !share) {
    return (
      <div className="mt-2.5 pt-2.5 border-t border-dashed border-border flex items-center gap-2 text-xs text-rose-600">
        <AlertCircle size={13} strokeWidth={2.2} />
        공유 링크 생성에 실패했어요
      </div>
    );
  }

  return (
    <div className="mt-2.5 pt-2.5 border-t border-dashed border-border flex flex-col gap-2">
      {/* 링크 바 — 전체 클릭 = 복사 */}
      <button
        onClick={copy}
        className="w-full flex items-center gap-2 border border-border rounded-[9px] bg-white px-3 py-2 hover:bg-surface hover:border-border-hover transition-colors"
      >
        <Link2 size={13} strokeWidth={2.2} className="text-text-faint shrink-0" />
        <span className="flex-1 min-w-0 text-left text-xs text-text-soft truncate mono">
          {shortUrl}
        </span>
        <span
          className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold ${
            copied ? "text-emerald-600" : "text-accent"
          }`}
        >
          {copied ? (
            <Check size={13} strokeWidth={2.5} />
          ) : (
            <Copy size={13} strokeWidth={2.2} />
          )}
          {copied ? "복사됨" : "복사"}
        </span>
      </button>

      {/* 모드(활성=주황) + 다운로드 허용 + 열기 */}
      <div className="flex items-center gap-2">
        <div className="flex bg-surface border border-border rounded-lg p-0.5">
          <button
            onClick={() => changeMode("full")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 transition-colors ${
              mode === "full"
                ? "bg-white text-accent shadow-sm"
                : "text-text-faint hover:text-text-soft"
            }`}
          >
            <MessageSquare size={12} strokeWidth={2.2} />
            검수
          </button>
          <button
            onClick={() => changeMode("preview")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 transition-colors ${
              mode === "preview"
                ? "bg-white text-accent shadow-sm"
                : "text-text-faint hover:text-text-soft"
            }`}
          >
            <Eye size={12} strokeWidth={2.2} />
            미리보기
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={toggleDownload}
          title={allowDownload ? "다운로드 허용됨" : "다운로드 꺼짐"}
          aria-pressed={allowDownload}
          className={`w-[30px] h-[30px] rounded-md grid place-items-center transition-colors ${
            allowDownload
              ? "text-accent"
              : "text-text-faint hover:bg-surface hover:text-text-soft"
          }`}
        >
          <Download size={15} strokeWidth={2} />
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          title="새 탭에서 열기"
          className="w-[30px] h-[30px] rounded-md grid place-items-center text-text-faint hover:bg-surface hover:text-text-soft transition-colors"
        >
          <ExternalLink size={15} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
