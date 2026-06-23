"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Folder, ArrowLeft, File as FileIconSvg } from "lucide-react";
import { Modal } from "./Modal";
import type { FileEntry } from "@/lib/fs/storage";
import { FileIcon } from "./FileIcon";

// 공유 링크 버전 추가 등 "파일 1개 고르기" 범용 다이얼로그
export function FilePickerDialog({
  open,
  onClose,
  onPick,
  title = "파일 선택",
  excludePaths = [],
  confirmLabel = "선택",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (path: string, entry: FileEntry) => void;
  title?: string;
  excludePaths?: string[];
  confirmLabel?: string;
}) {
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath("/");
    setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        const list = (body.entries as FileEntry[]).filter(
          (e) => e.isFolder || !excludePaths.includes(e.path),
        );
        // 폴더 먼저, 그 다음 파일 (이름순)
        list.sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, path, excludePaths]);

  const segments = path === "/" ? [] : path.split("/").filter(Boolean);

  const confirm = () => {
    if (!selected) return;
    onPick(selected.path, selected);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <FileIconSvg size={15} strokeWidth={2.2} />
          {title}
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="p-5">
        <div className="flex items-center gap-1 text-base mb-3 flex-wrap">
          <button
            onClick={() => setPath("/")}
            className="hover:text-accent text-text-muted transition-colors"
          >
            Vibox
          </button>
          {segments.map((seg, i) => {
            const next = "/" + segments.slice(0, i + 1).join("/");
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight
                  size={13}
                  className="text-text-faint"
                  strokeWidth={2}
                />
                {isLast ? (
                  <span className="text-text font-semibold">{seg}</span>
                ) : (
                  <button
                    onClick={() => setPath(next)}
                    className="hover:text-accent text-text-muted transition-colors"
                  >
                    {seg}
                  </button>
                )}
              </span>
            );
          })}
        </div>

        <div className="bg-surface border border-border rounded-md max-h-[320px] overflow-y-auto mb-4">
          {path !== "/" && (
            <button
              onClick={() =>
                setPath("/" + segments.slice(0, -1).join("/") || "/")
              }
              className="w-full flex items-center gap-2 px-4 py-2 text-base text-text-muted hover:bg-white border-b border-border"
            >
              <ArrowLeft size={13} />
              상위 폴더로
            </button>
          )}
          {loading && (
            <div className="p-4 text-sm text-text-faint">
              불러오는 중...
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div className="p-6 text-center text-sm text-text-faint">
              비어있어요
            </div>
          )}
          {entries.map((e) => {
            const isFolder = e.isFolder;
            const isSelected = selected?.path === e.path;
            return (
              <button
                key={e.path}
                onClick={() => {
                  if (isFolder) setPath(e.path);
                  else setSelected(isSelected ? null : e);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-base border-b border-[#f5f5f5] text-left transition-colors ${
                  isSelected
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-text hover:bg-white"
                }`}
              >
                {isFolder ? (
                  <Folder
                    size={14}
                    className="text-accent shrink-0"
                    strokeWidth={2}
                  />
                ) : (
                  <FileIcon kind={e.kind} />
                )}
                <span className="flex-1 truncate">{e.name}</span>
                {isFolder && (
                  <ChevronRight
                    size={13}
                    className="text-text-faint shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="text-sm text-text-soft mb-4 truncate">
          {selected ? (
            <>
              선택됨:{" "}
              <span className="font-mono text-text">{selected.name}</span>
            </>
          ) : (
            <span className="text-text-faint">파일을 선택하세요</span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-base font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={confirm}
            disabled={!selected}
            className="flex-1 bg-text text-white hover:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed py-2 rounded-md text-base font-semibold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
