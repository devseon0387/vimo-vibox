"use client";

import { useEffect } from "react";
import { Modal } from "./Modal";
import type { FileEntry } from "@/lib/fs/storage";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

function isImage(k: FileEntry["kind"]) {
  return k === "image";
}
function isVideo(k: FileEntry["kind"]) {
  return k === "video";
}
function isPdf(entry: FileEntry) {
  return entry.name.toLowerCase().endsWith(".pdf");
}
function isAudio(k: FileEntry["kind"]) {
  return k === "audio";
}

export function isPreviewableEntry(entry: FileEntry): boolean {
  if (entry.isFolder) return false;
  if (entry.kind === "image" || entry.kind === "video" || entry.kind === "audio") return true;
  if (entry.name.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

export function PreviewModal({
  entry,
  open,
  onClose,
  // Quick Look navigation (옵션)
  entries,
  onNavigate,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
  entries?: FileEntry[];
  onNavigate?: (direction: -1 | 1) => void;
}) {
  // ←/→ 키 네비게이션 + Space 토글 (Quick Look UX)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (onNavigate && e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigate(-1);
      } else if (onNavigate && e.key === "ArrowRight") {
        e.preventDefault();
        onNavigate(1);
      } else if (e.key === " ") {
        // Space로 Quick Look 닫기 (단, video/audio/input에 포커스 시 native 동작 유지)
        const active = document.activeElement as HTMLElement | null;
        if (
          active &&
          (active.tagName === "VIDEO" ||
            active.tagName === "AUDIO" ||
            active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "BUTTON" ||
            active.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onNavigate, onClose]);

  if (!entry) return null;
  const src = `/api/download?path=${encodeURIComponent(entry.path)}&inline=1`;

  // 현재 entry가 entries 배열의 몇 번째인지 + 이전/다음 navigable 인덱스 계산
  let counter: { index: number; total: number } | null = null;
  if (entries && entries.length > 0) {
    const previewables = entries.filter(isPreviewableEntry);
    const idx = previewables.findIndex((e) => e.path === entry.path);
    if (idx >= 0) counter = { index: idx + 1, total: previewables.length };
  }

  let body: React.ReactNode;
  if (isImage(entry.kind)) {
    body = (
      <div className="bg-[#1a1a1a] grid place-items-center py-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={entry.name} className="max-w-full max-h-[75vh] object-contain" />
      </div>
    );
  } else if (isVideo(entry.kind)) {
    const poster = `/api/thumb?path=${encodeURIComponent(entry.path)}`;
    body = (
      <div className="bg-black grid place-items-center">
        <video
          src={src}
          poster={poster}
          controls
          autoPlay
          preload="auto"
          className="max-w-full max-h-[75vh]"
        />
      </div>
    );
  } else if (isAudio(entry.kind)) {
    body = (
      <div className="p-8 bg-surface grid place-items-center">
        <audio src={src} controls autoPlay className="w-full" />
      </div>
    );
  } else if (isPdf(entry)) {
    body = (
      <div className="h-[75vh] bg-[#1a1a1a]">
        <iframe
          src={src}
          className="w-full h-full border-0"
          title={entry.name}
        />
      </div>
    );
  } else {
    body = (
      <div className="p-12 text-center">
        <div className="text-[14px] text-text-muted mb-6">
          이 파일은 브라우저에서 미리볼 수 없습니다
        </div>
        <a
          href={`/api/download?path=${encodeURIComponent(entry.path)}`}
          download={entry.name}
          className="inline-flex items-center gap-2 bg-accent text-white px-5 py-2.5 rounded-md text-[14px] font-semibold hover:bg-accent-hover"
        >
          <Download size={15} strokeWidth={2.5} />
          다운로드
        </a>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.name}
      maxWidth="max-w-5xl"
    >
      {body}
      {/* footer: navigation hint + counter */}
      {(counter || onNavigate) && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-border bg-surface text-[11.5px] text-text-faint">
          {onNavigate && (
            <>
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                title="이전 (←)"
                className="w-7 h-7 grid place-items-center rounded hover:bg-hover hover:text-text"
              >
                <ChevronLeft size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(1)}
                title="다음 (→)"
                className="w-7 h-7 grid place-items-center rounded hover:bg-hover hover:text-text"
              >
                <ChevronRight size={14} strokeWidth={2.2} />
              </button>
            </>
          )}
          {counter && (
            <span className="font-mono">
              {counter.index} / {counter.total}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-border rounded font-mono">←</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-border rounded font-mono">→</kbd>
            <span>전환</span>
            <span className="opacity-50">·</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-border rounded font-mono">Space</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-border rounded font-mono">Esc</kbd>
            <span>닫기</span>
          </span>
        </div>
      )}
    </Modal>
  );
}
