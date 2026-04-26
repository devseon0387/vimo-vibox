"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";
import { ActionBar } from "./ActionBar";
import { BulkActionBar } from "./BulkActionBar";
import { DropZone } from "./DropZone";
import { FileTable } from "./FileTable";
import { FileCardGrid } from "./FileCardGrid";
import { ConflictDialog } from "./ConflictDialog";
import { type ConflictMode } from "@/lib/upload";
import { useUpload } from "@/lib/upload-store";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";

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
  const toast = useToast();
  const { enqueue, uploads } = useUpload();
  const [view, setView] = useState<ViewMode>("list");

  // 이 폴더 대상 진행 중 업로드가 있나? (ActionBar 비활성화는 안 함 — 글로벌 업로드라 동시 가능. 단순 상태표시용)
  const uploadingHere = uploads.some(
    (u) => u.status === "running" && u.targetPath.startsWith(currentPath),
  );

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

  // 폴더 업로드 충돌 처리 — 사용자가 모드 선택할 때까지 대기
  const [pendingConflict, setPendingConflict] = useState<{
    files: File[];
    conflicts: string[];
    resolve: (mode: ConflictMode | null) => void;
  } | null>(null);

  const runUpload = useCallback(
    (files: File[], conflictMode?: ConflictMode) => {
      // 글로벌 큐로 enqueue. 페이지 이동해도 진행 + 완료 토스트 + router.refresh 모두 Provider 가 처리
      enqueue(currentPath, files, {
        conflictMode,
        onComplete: (entry) => {
          if (entry.status === "done") {
            toast.success(
              <>
                <span className="font-semibold">{entry.fileCount}개 파일</span>{" "}
                업로드 완료
              </>,
            );
          } else if (entry.status === "failed") {
            toast.error(humanError(entry.error, "upload"));
          }
          // cancelled 는 사용자 의도라 토스트 X (도크에서 시각적 표시됨)
        },
      });
    },
    [currentPath, enqueue, toast],
  );

  const doUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // 폴더 업로드(__relPath 있는 파일 포함)인 경우 사전 충돌 검사
      const candidatePaths = files.map((f) => {
        const rel = (f as File & { __relPath?: string }).__relPath;
        const dirSeg = rel ? rel.split("/").slice(0, -1).join("/") : "";
        const subDir = dirSeg ? `/${dirSeg}` : "";
        const base =
          (currentPath.endsWith("/") ? currentPath.slice(0, -1) : currentPath) +
          subDir;
        return `${base}/${f.name}`;
      });

      let existing: string[] = [];
      try {
        const r = await fetch("/api/files/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: candidatePaths }),
        });
        if (r.ok) {
          const data = (await r.json()) as { existing: string[] };
          existing = data.existing ?? [];
        }
      } catch {
        // 사전 체크 실패해도 업로드 자체는 진행 (서버가 autonumber 로 처리)
      }

      let conflictMode: ConflictMode | undefined;
      if (existing.length > 0) {
        conflictMode = await new Promise<ConflictMode | null>((resolve) => {
          setPendingConflict({
            files,
            conflicts: existing,
            resolve,
          });
        }) ?? undefined;
        setPendingConflict(null);
        if (conflictMode === undefined) {
          // 취소
          toast.info("업로드 취소됨");
          return;
        }
      }

      runUpload(files, conflictMode);
    },
    [currentPath, runUpload, toast],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5">
        <ActionBar
          currentPath={currentPath}
          onUpload={doUpload}
          uploading={uploadingHere}
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
      {/* UploadProgress 는 글로벌 GlobalUploadDock 으로 이전 — (app)/layout.tsx 에 mount */}
      <ConflictDialog
        open={!!pendingConflict}
        conflicts={pendingConflict?.conflicts ?? []}
        onChoose={(mode) => pendingConflict?.resolve(mode)}
        onCancel={() => pendingConflict?.resolve(null)}
      />
    </>
  );
}
