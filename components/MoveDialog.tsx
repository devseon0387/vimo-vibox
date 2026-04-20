"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Folder, ArrowLeft, MoveRight } from "lucide-react";
import { Modal } from "./Modal";
import type { FileEntry } from "@/lib/fs/storage";
import { useToast } from "./Toast";

export function MoveDialog({
  entry,
  open,
  onClose,
  onMoved,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [path, setPath] = useState<string>("/");
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setPath("/");
  }, [open, entry?.path]);

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
        const onlyFolders = (body.entries as FileEntry[])
          .filter((e) => e.isFolder)
          // 자기 자신 안으로 이동 불가
          .filter((e) => !entry || e.path !== entry.path);
        setFolders(onlyFolders);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, path, entry?.path]);

  if (!entry) return null;

  const segments = path === "/" ? [] : path.split("/").filter(Boolean);

  const currentParent = entry.path.split("/").slice(0, -1).join("/") || "/";
  const targetSame = path === currentParent;

  const doMove = async () => {
    setMoving(true);
    try {
      const toPath = (path === "/" ? "" : path) + "/" + entry.name;
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: entry.path, to: toPath }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("이동 실패: " + (body.error ?? res.statusText));
        return;
      }
      toast.success(
        <>
          <span className="font-semibold">{entry.name}</span>{" "}
          {path === "/" ? "루트로" : `${path}으로`} 이동됨
        </>,
      );
      onMoved();
      onClose();
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <MoveRight size={15} strokeWidth={2.2} />
          &quot;{entry.name}&quot; 이동
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="p-5">
        <div className="text-[12px] text-text-faint mb-2">대상 폴더</div>
        <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap">
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
                <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
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

        <div className="bg-surface border border-border rounded-md max-h-[260px] overflow-y-auto mb-4">
          {path !== "/" && (
            <button
              onClick={() =>
                setPath("/" + segments.slice(0, -1).join("/") || "/")
              }
              className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-text-muted hover:bg-white border-b border-border"
            >
              <ArrowLeft size={13} />
              상위 폴더로
            </button>
          )}
          {loading && (
            <div className="p-4 text-[12.5px] text-text-faint">불러오는 중...</div>
          )}
          {!loading && folders.length === 0 && (
            <div className="p-6 text-center text-[12.5px] text-text-faint">
              여기엔 폴더가 없습니다
              {path === "/" && " (루트에 이동)"}
            </div>
          )}
          {folders.map((f) => (
            <button
              key={f.path}
              onClick={() => setPath(f.path)}
              className="w-full flex items-center gap-2 px-4 py-2 text-[13.5px] text-text hover:bg-white border-b border-[#f5f5f5]"
            >
              <Folder size={14} className="text-accent" strokeWidth={2} />
              <span className="flex-1 text-left">{f.name}</span>
              <ChevronRight size={13} className="text-text-faint" />
            </button>
          ))}
        </div>

        <div className="text-[12px] text-text-soft mb-4">
          이동 대상: <span className="font-mono text-text">{path}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-[13.5px] font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={doMove}
            disabled={moving || targetSame}
            className="flex-1 bg-text text-white hover:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed py-2 rounded-md text-[13.5px] font-semibold"
          >
            {moving ? "이동 중..." : targetSame ? "현재 폴더" : "여기로 이동"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
