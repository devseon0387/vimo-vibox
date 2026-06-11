"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";
import { ActionBar } from "./ActionBar";
import { BulkActionBar } from "./BulkActionBar";
import { DropZone } from "./DropZone";
import { FileTable } from "./FileTable";
import { FileCardGrid } from "./FileCardGrid";
import { ConflictDialog } from "./ConflictDialog";
import { SortDropdown } from "./SortDropdown";
import { useSortConfig, sortEntries } from "@/lib/file-sort";
import { type ConflictMode } from "@/lib/upload";
import { useUpload } from "@/lib/upload-store";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";
import { StatusBar } from "./StatusBar";

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
  session: { id: string; isAdmin: boolean; canSeeHealth?: boolean };
  stats?: Record<
    string,
    { commentCount: number; openCount: number; uploaderName?: string | null }
  >;
}) {
  const toast = useToast();
  const { enqueue, uploads } = useUpload();
  const [view, setView] = useState<ViewMode>("list");
  const emptyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const onEmptyUploadClick = useCallback(() => {
    emptyUploadInputRef.current?.click();
  }, []);

  // 렌더링 zone 루트("/")에선 새 폴더 만들기 막고, 업로드는 자동으로 /Rendering 으로 보냄.
  // 자료실 루트는 zone prefix 가 다르므로 영향 없음.
  const isRenderingRoot = currentPath === "/" || currentPath === "";
  const uploadTargetPath = isRenderingRoot ? "/Rendering" : currentPath;

  // 정렬
  const { config: sortConfig, setKey: setSortKey, toggleOrder, setFoldersFirst } =
    useSortConfig();

  // 낙관적 업데이트: 삭제·이동 즉시 리스트에서 숨김. entries prop 변경 시 자동 리셋
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 서버에서 새 entries 가 도착하면 (router.refresh 후) 숨김 상태 초기화
    setHiddenPaths(new Set());
  }, [entries]);

  const hideOptimistic = useCallback((paths: string[]) => {
    setHiddenPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.add(p);
      return next;
    });
  }, []);
  const unhideOptimistic = useCallback((paths: string[]) => {
    setHiddenPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.delete(p);
      return next;
    });
  }, []);

  const sortedEntries = useMemo(
    () =>
      sortEntries(entries, sortConfig).filter(
        (e) => !hiddenPaths.has(e.path),
      ),
    [entries, sortConfig, hiddenPaths],
  );

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
          const idxA = sortedEntries.findIndex(
            (e) => e.path === lastClickedPath,
          );
          const idxB = sortedEntries.findIndex((e) => e.path === path);
          if (idxA !== -1 && idxB !== -1) {
            const [from, to] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
            for (let i = from; i <= to; i++) next.add(sortedEntries[i].path);
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
    [sortedEntries, lastClickedPath],
  );

  const clearSelect = useCallback(() => {
    setSelectedPaths(new Set());
    setLastClickedPath(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(sortedEntries.map((e) => e.path)));
  }, [sortedEntries]);

  const selectedEntries = useMemo(
    () => sortedEntries.filter((e) => selectedPaths.has(e.path)),
    [sortedEntries, selectedPaths],
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
      // 렌더링 root 에서는 자동으로 /Rendering 으로 보냄
      enqueue(uploadTargetPath, files, {
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

      // 폴더 업로드(__relPath 있는 파일 포함)인 경우 사전 충돌 검사 — uploadTargetPath 기준
      const candidatePaths = files.map((f) => {
        const rel = (f as File & { __relPath?: string }).__relPath;
        const dirSeg = rel ? rel.split("/").slice(0, -1).join("/") : "";
        const subDir = dirSeg ? `/${dirSeg}` : "";
        const base =
          (uploadTargetPath.endsWith("/")
            ? uploadTargetPath.slice(0, -1)
            : uploadTargetPath) + subDir;
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
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-5">
        <ActionBar
          currentPath={currentPath}
          onUpload={doUpload}
          uploading={uploadingHere}
          disableNewFolder={isRenderingRoot}
        />
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <SortDropdown
            config={sortConfig}
            onChangeKey={setSortKey}
            onToggleOrder={toggleOrder}
            onToggleFoldersFirst={setFoldersFirst}
          />
          {/* view toggle은 모바일에선 숨김 (어차피 카드 강제) */}
          <div className="hidden md:flex items-center rounded-md border border-border bg-white p-0.5">
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
      </div>

      <BulkActionBar
        selected={selectedEntries}
        onClear={clearSelect}
        onOptimisticHide={hideOptimistic}
        onOptimisticUnhide={unhideOptimistic}
      />

      {(() => {
        const fileViewProps = {
          entries: sortedEntries,
          basePath: currentPath,
          session,
          stats,
          selectedPaths,
          onToggleSelect: toggleSelect,
          onOptimisticHide: hideOptimistic,
          onOptimisticUnhide: unhideOptimistic,
          onEmptyUploadClick,
        };
        // 모바일(<md)에선 view 무관 카드 그리드 강제 (표는 좁은 화면에서 가로 스크롤 강제 → UX 나쁨)
        if (view === "grid") return <FileCardGrid {...fileViewProps} />;
        return (
          <>
            <div className="md:hidden">
              <FileCardGrid {...fileViewProps} />
            </div>
            <div className="hidden md:block">
              <FileTable {...fileViewProps} />
            </div>
          </>
        );
      })()}
      {/* EmptyState dropzone 클릭 시 열리는 hidden picker */}
      <input
        ref={emptyUploadInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          doUpload(Array.from(files));
          if (emptyUploadInputRef.current) emptyUploadInputRef.current.value = "";
        }}
      />
      {/* StatusBar — admin 전용 (매니저/파트너에겐 거슬려서 숨김) */}
      {session.isAdmin && (
        <StatusBar
          entriesCount={sortedEntries.length}
          folderCount={sortedEntries.filter((e) => e.isFolder).length}
          fileCount={sortedEntries.filter((e) => !e.isFolder).length}
          selectedCount={selectedPaths.size}
          canSeeHealth={session.canSeeHealth ?? session.isAdmin}
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
