"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";
import { ActionBar } from "./ActionBar";
import { BulkActionBar } from "./BulkActionBar";
import { DropZone } from "./DropZone";
import { FileTable } from "./FileTable";
import { FileCardGrid } from "./FileCardGrid";
import { UploadProgress, type UploadState } from "./UploadProgress";
import { startUpload } from "@/lib/upload";
import { useToast } from "./Toast";

type ViewMode = "list" | "grid";
const VIEW_MODE_KEY = "vibox:files:view";

export function FilesPane({
  entries,
  currentPath,
  session,
  stats,
}: {
  entries: FileEntry[];
  currentPath: string;
  session: { id: string; isAdmin: boolean };
  stats?: Record<string, { commentCount: number; openCount: number }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  // 다중 선택 상태 (path 기준 set)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);

  // entries 또는 currentPath 바뀌면 선택 해제
  useEffect(() => {
    setSelectedPaths(new Set());
    setLastClickedPath(null);
  }, [currentPath, entries.length]);

  const toggleSelect = useCallback(
    (path: string, opts?: { range?: boolean; toggle?: boolean }) => {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (opts?.range && lastClickedPath) {
          // shift+click — lastClicked 와 path 사이의 모든 항목 선택
          const idxA = entries.findIndex((e) => e.path === lastClickedPath);
          const idxB = entries.findIndex((e) => e.path === path);
          if (idxA !== -1 && idxB !== -1) {
            const [from, to] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
            for (let i = from; i <= to; i++) next.add(entries[i].path);
            return next;
          }
        }
        if (opts?.toggle ?? true) {
          if (next.has(path)) next.delete(path);
          else next.add(path);
        } else {
          next.clear();
          next.add(path);
        }
        return next;
      });
      setLastClickedPath(path);
    },
    [entries, lastClickedPath],
  );

  const clearSelect = useCallback(() => {
    setSelectedPaths(new Set());
    setLastClickedPath(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(entries.map((e) => e.path)));
  }, [entries]);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedPaths.has(e.path)),
    [entries, selectedPaths],
  );

  // ⌘A / Ctrl+A 전체 선택, Esc 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        if (entries.length > 0) {
          e.preventDefault();
          selectAll();
        }
      }
      if (e.key === "Escape" && selectedPaths.size > 0) {
        clearSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, selectedPaths.size, selectAll, clearSelect]);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  const setViewPersist = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_MODE_KEY, v);
    } catch {}
  };

  const doUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const total = files.reduce((s, f) => s + f.size, 0);
      setUploadState({ files, sent: 0, total, startedAt: Date.now() });

      const h = startUpload(
        currentPath,
        files,
        (sent, totalBytes) => {
          setUploadState((prev) =>
            prev ? { ...prev, sent, total: totalBytes } : prev,
          );
        },
        (statsProgress) => {
          setUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  peakBytesPerSec: statsProgress.peakBytesPerSec,
                  chunksByShard: { ...statsProgress.chunksByShard },
                }
              : prev,
          );
        },
      );
      cancelRef.current = h.cancel;
      const res = await h.done;
      cancelRef.current = null;
      setUploadState(null);

      if (!res.ok) {
        if (res.error === "aborted") {
          toast.info("업로드가 취소됐어요");
        } else {
          toast.error("업로드 실패: " + (res.error ?? "unknown"));
        }
        return;
      }
      const count = res.saved?.length ?? files.length;
      toast.success(
        <>
          <span className="font-semibold">{count}개 파일</span> 업로드 완료
        </>,
      );
      router.refresh();
    },
    [currentPath, router, toast],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5">
        <ActionBar
          currentPath={currentPath}
          onUpload={doUpload}
          uploading={!!uploadState}
        />
        <div className="flex items-center rounded-md border border-border bg-white p-0.5 shrink-0">
          <button
            onClick={() => setViewPersist("list")}
            title="리스트 보기"
            className={`px-1.5 py-1 rounded transition-colors ${
              view === "list"
                ? "bg-surface text-text"
                : "text-text-soft hover:text-text"
            }`}
          >
            <List size={15} strokeWidth={2} />
          </button>
          <button
            onClick={() => setViewPersist("grid")}
            title="카드 보기"
            className={`px-1.5 py-1 rounded transition-colors ${
              view === "grid"
                ? "bg-surface text-text"
                : "text-text-soft hover:text-text"
            }`}
          >
            <LayoutGrid size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      <BulkActionBar selected={selectedEntries} onClear={clearSelect} />

      {view === "grid" ? (
        <FileCardGrid
          entries={entries}
          basePath={currentPath}
          session={session}
          stats={stats}
          selectedPaths={selectedPaths}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <FileTable
          entries={entries}
          basePath={currentPath}
          session={session}
          selectedPaths={selectedPaths}
          onToggleSelect={toggleSelect}
        />
      )}
      <DropZone onFiles={doUpload} />
      <UploadProgress
        state={uploadState}
        onCancel={() => cancelRef.current?.()}
      />
    </>
  );
}
