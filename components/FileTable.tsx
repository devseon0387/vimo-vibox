"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLongPress } from "@/lib/use-long-press";
import { Thumbnail } from "./Thumbnail";
import { directDownloadUrl } from "@/lib/media-route";
import type { FileEntry } from "@/lib/fs/storage";
import { Download, Trash2, Pencil, Link as LinkIcon, MoveRight } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { usePrompt } from "./PromptDialog";
import { humanError } from "@/lib/human-error";
import { PreviewModal, isPreviewableEntry } from "./PreviewModal";
import { SpaceLabel } from "./dashboard/SpaceLabel";
import { MoveDialog } from "./MoveDialog";
import { ShareDialog } from "./ShareDialog";
import { stripDisplayPrefix } from "@/lib/path-display";
import {
  startInternalDrag,
  endInternalDrag,
  getActiveDrag,
  isInternalDrag,
  readInternalDragPaths,
  isValidDropTarget,
  movePathsTo,
} from "@/lib/dnd-move";
import { useToast } from "./Toast";
import { ContextMenu, type CtxItem } from "./ContextMenu";
import { EmptyState } from "./EmptyState";
import { TimeCell } from "./TimeCell";

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `오늘 ${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "어제";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function isPreviewable(entry: FileEntry) {
  if (entry.kind === "image" || entry.kind === "video" || entry.kind === "audio") return true;
  if (entry.name.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function isVideo(entry: FileEntry) {
  return entry.kind === "video";
}

type FileStats = {
  commentCount: number;
  openCount: number;
  uploaderName?: string | null;
};

export function FileTable({
  entries,
  basePath,
  session,
  stats,
  selectedPaths,
  onToggleSelect,
  onOptimisticHide,
  onOptimisticUnhide,
  onEmptyUploadClick,
  displayPrefix,
}: {
  entries: FileEntry[];
  basePath: string;
  session?: { id: string; isAdmin: boolean };
  stats?: Record<string, FileStats>;
  selectedPaths?: Set<string>;
  onToggleSelect?: (
    path: string,
    opts?: { range?: boolean; toggle?: boolean },
  ) => void;
  /** 낙관적 업데이트: 즉시 리스트에서 숨김. 실패 시 unhide */
  onOptimisticHide?: (paths: string[]) => void;
  onOptimisticUnhide?: (paths: string[]) => void;
  /** EmptyState dropzone 클릭 시 파일 picker 트리거 */
  onEmptyUploadClick?: () => void;
  /** 개인 드라이브 컨텍스트(/personal/{userId}) — URL/표시에서 가릴 prefix */
  displayPrefix?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [moveEntry, setMoveEntry] = useState<FileEntry | null>(null);
  const [shareEntry, setShareEntry] = useState<FileEntry | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    entry: FileEntry;
    x: number;
    y: number;
  } | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { promptInput, dialog: promptDialog } = usePrompt();
  const { show: showToast } = useToast();
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const rows = useMemo(() => entries, [entries]);

  const onOpen = (entry: FileEntry) => {
    if (entry.isFolder) {
      // 현재 라우트(/team·/my/box 등)를 유지하며 폴더 진입. 과거엔 `/?path=` 하드코딩이라
      // 홈이 대시보드로 바뀐 뒤 폴더 클릭이 대시보드로 튕기던 버그.
      // 개인 드라이브는 URL에서 /personal/{userId} prefix를 가린다.
      const target = stripDisplayPrefix(entry.path, displayPrefix);
      router.push(`${pathname}?path=${encodeURIComponent(target)}`);
    } else if (isVideo(entry)) {
      // 팀·개인 영상 모두 피드백 워크스페이스(vimo-box)로 — 권한은 canAccessFile이 담당.
      router.push(`/vimo-box?path=${encodeURIComponent(entry.path)}`);
    } else if (isPreviewable(entry)) {
      setPreviewEntry(entry);
    } else {
      window.open(
        directDownloadUrl(
          `/api/download?path=${encodeURIComponent(entry.path)}`,
          entry.path,
        ),
        "_self",
      );
    }
  };

  // PreviewModal navigation: previewable 항목들 사이를 ←/→로 이동
  const onPreviewNavigate = (direction: -1 | 1) => {
    if (!previewEntry) return;
    const previewables = rows.filter(isPreviewableEntry);
    if (previewables.length === 0) return;
    const idx = previewables.findIndex((e) => e.path === previewEntry.path);
    if (idx < 0) return;
    const nextIdx = (idx + direction + previewables.length) % previewables.length;
    const next = previewables[nextIdx];
    setPreviewEntry(next);
    // focusedIndex도 따라가면 modal 닫은 후에도 위치 유지됨
    const rowIdx = rows.findIndex((e) => e.path === next.path);
    if (rowIdx >= 0) setFocusedIndex(rowIdx);
  };

  // 키보드 네비게이션: ↑↓ focus, Enter open, Space preview, F2 rename, Del delete, Esc clear
  useEffect(() => {
    if (previewEntry) return; // PreviewModal이 자체 키 핸들러 가짐
    if (moveEntry || shareEntry) return; // 다른 모달 열림
    if (ctxMenu) return; // 컨텍스트 메뉴가 열려있으면 메뉴가 키보드 처리
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
        return;
      }
      if (rows.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.min(rows.length - 1, i + 1)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.max(0, i - 1)));
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(rows.length - 1);
          break;
        case "Enter": {
          if (focusedIndex !== null && focusedIndex < rows.length) {
            e.preventDefault();
            onOpen(rows[focusedIndex]);
          }
          break;
        }
        case " ": {
          if (focusedIndex !== null && focusedIndex < rows.length) {
            const entry = rows[focusedIndex];
            if (isPreviewableEntry(entry)) {
              e.preventDefault();
              setPreviewEntry(entry);
            }
          }
          break;
        }
        case "F2": {
          if (focusedIndex !== null && focusedIndex < rows.length) {
            e.preventDefault();
            onRename(rows[focusedIndex]);
          }
          break;
        }
        case "Delete":
        case "Backspace": {
          if (focusedIndex !== null && focusedIndex < rows.length) {
            e.preventDefault();
            onDelete(rows[focusedIndex]);
          }
          break;
        }
        case "Escape":
          if (focusedIndex !== null) {
            setFocusedIndex(null);
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEntry, moveEntry, shareEntry, ctxMenu, focusedIndex, rows]);

  // focusedIndex 변경 시 해당 row를 화면 안으로 스크롤
  useEffect(() => {
    if (focusedIndex === null || !tbodyRef.current) return;
    const row = tbodyRef.current.querySelector<HTMLTableRowElement>(
      `tr[data-row-idx="${focusedIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // rows가 줄어들었을 때 focusedIndex 클램프
  useEffect(() => {
    if (focusedIndex === null) return;
    if (focusedIndex >= rows.length) {
      setFocusedIndex(rows.length === 0 ? null : rows.length - 1);
    }
  }, [rows.length, focusedIndex]);

  const onDelete = async (entry: FileEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: `${entry.isFolder ? "폴더" : "파일"} 삭제`,
      message: (
        <>
          <span className="font-semibold text-text">{entry.name}</span>
          {entry.isFolder ? (
            <> 폴더를 휴지통으로 옮겨요.</>
          ) : (
            <> 파일을 휴지통으로 옮겨요.</>
          )}
          <br />
          30일 이내에 언제든 복원할 수 있어요.
        </>
      ),
      confirmLabel: "휴지통으로",
      variant: "danger",
    });
    if (!ok) return;

    // 낙관적: 즉시 리스트에서 숨김
    onOptimisticHide?.([entry.path]);
    setDeleting(entry.path);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // 롤백
        onOptimisticUnhide?.([entry.path]);
        const body = await res.json().catch(() => ({}));
        showToast(humanError(body.error ?? res.statusText, "delete"), "error");
        return;
      }
      const body = await res.json().catch(() => ({}));
      const trashId: string | undefined = body?.trashId;
      showToast(
        <>
          <span className="font-semibold">{entry.name}</span> 삭제됨
        </>,
        {
          kind: "success",
          action: trashId
            ? {
                label: "되돌리기",
                onClick: async () => {
                  const r = await fetch(`/api/trash/${trashId}`, {
                    method: "POST",
                  });
                  if (r.ok) {
                    showToast("복원됨");
                    router.refresh();
                  } else {
                    showToast("복원 실패", "error");
                  }
                },
              }
            : undefined,
        },
      );
      router.refresh();
    } finally {
      setDeleting(null);
    }
  };

  const onRename = async (entry: FileEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newName = await promptInput({
      title: `${entry.isFolder ? "폴더" : "파일"} 이름 변경`,
      defaultValue: entry.name,
      confirmLabel: "변경",
      validate: (v) => {
        if (!/^[^/\\:*?"<>|]+$/.test(v)) return "이름에 사용할 수 없는 문자가 있습니다";
        if (v === entry.name) return "기존 이름과 같습니다";
        return null;
      },
    });
    if (!newName) return;
    const parent = entry.path.split("/").slice(0, -1).join("/") || "/";
    const toPath =
      (parent === "/" ? "" : parent) + "/" + newName;
    const res = await fetch("/api/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: entry.path, to: toPath }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(humanError(body.error ?? res.statusText, "rename"), "error");
      return;
    }
    showToast(
      <>
        이름 변경됨: <span className="font-semibold">{newName}</span>
      </>,
    );
    router.refresh();
  };

  const onDownload = (entry: FileEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const a = document.createElement("a");
    if (entry.isFolder) {
      a.href = directDownloadUrl(
        `/api/download/zip?path=${encodeURIComponent(entry.path)}`,
        entry.path,
      );
      a.download = `${entry.name}.zip`;
    } else {
      a.href = directDownloadUrl(
        `/api/download?path=${encodeURIComponent(entry.path)}`,
        entry.path,
      );
      a.download = entry.name;
    }
    a.click();
  };

  const onShare = (entry: FileEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShareEntry(entry);
  };

  const onMove = (entry: FileEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMoveEntry(entry);
  };

  // 드래그앤드롭으로 폴더에 떨어뜨려 이동
  const onMoveDrop = async (srcPaths: string[], destDir: string) => {
    onOptimisticHide?.(srcPaths);
    const { success, failed } = await movePathsTo(srcPaths, destDir);
    if (failed > 0) {
      onOptimisticUnhide?.(srcPaths);
      showToast(`${failed}개 이동 실패`, "error");
    } else if (success > 0) {
      showToast(
        <>
          <span className="font-semibold">{success}개</span> 이동됨
        </>,
      );
    }
    router.refresh();
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      showToast("경로 복사됨");
    } catch {
      showToast("경로 복사 실패", "error");
    }
  };

  const onRowContextMenu = (entry: FileEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = rows.findIndex((r) => r.path === entry.path);
    if (idx >= 0) setFocusedIndex(idx);
    setCtxMenu({ entry, x: e.clientX, y: e.clientY });
  };

  const buildCtxItems = (entry: FileEntry): CtxItem[] => {
    const items: CtxItem[] = [
      { kind: "item", label: "열기", shortcut: "↵", onSelect: () => onOpen(entry) },
    ];
    if (isPreviewableEntry(entry)) {
      items.push({
        kind: "item",
        label: "미리보기",
        shortcut: "Space",
        onSelect: () => setPreviewEntry(entry),
      });
    }
    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      label: "이름 변경",
      shortcut: "F2",
      onSelect: () => onRename(entry),
    });
    items.push({
      kind: "item",
      label: "이동…",
      onSelect: () => onMove(entry),
    });
    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      label: entry.isFolder ? "폴더 공유 링크 만들기" : "공유 링크 만들기",
      onSelect: () => onShare(entry),
    });
    items.push({
      kind: "item",
      label: entry.isFolder ? "ZIP 다운로드" : "다운로드",
      onSelect: () => onDownload(entry),
    });
    items.push({
      kind: "item",
      label: "경로 복사",
      onSelect: () => copyPath(stripDisplayPrefix(entry.path, displayPrefix)),
    });
    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      label: "삭제",
      shortcut: "⌫",
      danger: true,
      onSelect: () => onDelete(entry),
    });
    return items;
  };

  const empty = rows.length === 0;

  return (
    <>
      {empty ? (
        <EmptyState
          currentPath={basePath}
          isRoot={basePath === "/" || basePath === displayPrefix}
          onUploadClick={onEmptyUploadClick}
        />
      ) : (
        <div className="bg-white rounded-md overflow-x-auto">
          <table className="w-full min-w-[680px] text-base">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 w-[36px]">
                  {onToggleSelect && entries.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={
                        !!selectedPaths &&
                        entries.length > 0 &&
                        entries.every((e) => selectedPaths.has(e.path))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          for (const en of entries) {
                            if (!selectedPaths?.has(en.path)) {
                              onToggleSelect(en.path, { toggle: true });
                            }
                          }
                        } else {
                          for (const en of entries) {
                            if (selectedPaths?.has(en.path)) {
                              onToggleSelect(en.path, { toggle: true });
                            }
                          }
                        }
                      }}
                      className="cursor-pointer"
                    />
                  )}
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[120px]">
                  업로더
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[140px]">
                  수정일
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[100px]">
                  크기
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[170px]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((entry, idx) => {
                const isSelected = selectedPaths?.has(entry.path) ?? false;
                const isFocused = focusedIndex === idx;
                return (
                <FileRow
                  key={entry.path}
                  index={idx}
                  entry={entry}
                  uploaderName={stats?.[entry.path]?.uploaderName ?? null}
                  isSelected={isSelected}
                  isFocused={isFocused}
                  deleting={deleting === entry.path}
                  selectedPaths={selectedPaths}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                  onRename={onRename}
                  onMove={onMove}
                  onShare={onShare}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onMoveDrop={onMoveDrop}
                  displayPrefix={displayPrefix}
                  onFocus={() => setFocusedIndex(idx)}
                  onContextMenu={onRowContextMenu}
                />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}
      {promptDialog}
      <PreviewModal
        entry={previewEntry}
        open={!!previewEntry}
        onClose={() => setPreviewEntry(null)}
        entries={rows}
        onNavigate={onPreviewNavigate}
      />
      <MoveDialog
        entry={moveEntry}
        open={!!moveEntry}
        onClose={() => setMoveEntry(null)}
        displayPrefix={displayPrefix}
        onMoved={() => {
          // 낙관적: 이동 시작 즉시 리스트에서 숨김 (서버 refresh 끝나면 자연스럽게 갱신)
          if (moveEntry) onOptimisticHide?.([moveEntry.path]);
          router.refresh();
        }}
      />
      <ShareDialog
        entry={shareEntry}
        open={!!shareEntry}
        onClose={() => setShareEntry(null)}
      />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems(ctxMenu.entry)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

function FileRow({
  index,
  entry,
  uploaderName,
  isSelected,
  isFocused,
  deleting,
  selectedPaths,
  onToggleSelect,
  onOpen,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
  onMoveDrop,
  displayPrefix,
  onFocus,
  onContextMenu,
}: {
  index: number;
  entry: FileEntry;
  uploaderName?: string | null;
  isSelected: boolean;
  isFocused: boolean;
  deleting: boolean;
  selectedPaths?: Set<string>;
  onToggleSelect?: (
    path: string,
    opts?: { range?: boolean; toggle?: boolean },
  ) => void;
  onOpen: (e: FileEntry) => void;
  onRename: (e: FileEntry, ev?: React.MouseEvent) => void;
  onMove: (e: FileEntry, ev?: React.MouseEvent) => void;
  onShare: (e: FileEntry, ev?: React.MouseEvent) => void;
  onDownload: (e: FileEntry, ev?: React.MouseEvent) => void;
  onDelete: (e: FileEntry, ev?: React.MouseEvent) => void;
  onMoveDrop?: (srcPaths: string[], destDir: string) => void;
  displayPrefix?: string;
  onFocus: () => void;
  onContextMenu: (entry: FileEntry, ev: React.MouseEvent) => void;
}) {
  const [dropHover, setDropHover] = useState(false);
  const longPress = useLongPress(
    () => {
      if (onToggleSelect) onToggleSelect(entry.path, { toggle: true });
    },
    { delayMs: 500 },
  );

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (longPress.consumedClick()) return;
    if ((e.target as HTMLElement).closest("input[type=checkbox]")) return;
    onFocus();
    if (e.shiftKey && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(entry.path, { range: true });
      return;
    }
    if ((e.metaKey || e.ctrlKey) && onToggleSelect) {
      onToggleSelect(entry.path);
      return;
    }
    if ((selectedPaths?.size ?? 0) > 0 && onToggleSelect) {
      onToggleSelect(entry.path);
      return;
    }
    onOpen(entry);
  };

  return (
    <tr
      data-row-idx={index}
      draggable
      onDragStart={(e) => {
        // 체크박스·액션버튼에서 시작한 드래그는 무시
        if ((e.target as HTMLElement).closest("input,button")) {
          e.preventDefault();
          return;
        }
        startInternalDrag(e, entry.path, selectedPaths);
      }}
      onDragEnd={endInternalDrag}
      onDragOver={(e) => {
        if (!entry.isFolder) return;
        const src = getActiveDrag();
        if (isInternalDrag(e) && src && isValidDropTarget(src, entry.path)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dropHover) setDropHover(true);
        }
      }}
      onDragLeave={() => {
        if (dropHover) setDropHover(false);
      }}
      onDrop={(e) => {
        if (!entry.isFolder) return;
        setDropHover(false);
        const src = readInternalDragPaths(e);
        if (!src || !isValidDropTarget(src, entry.path)) return;
        e.preventDefault();
        onMoveDrop?.(src, entry.path);
      }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(entry, e)}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      className={`border-b border-[#f5f5f5] hover:bg-surface cursor-pointer transition-colors select-none ${
        deleting ? "opacity-40" : ""
      } ${isSelected ? "bg-accent-soft hover:bg-accent-soft" : ""} ${
        isFocused ? "ring-2 ring-inset ring-accent bg-accent-soft/40" : ""
      } ${dropHover ? "ring-2 ring-inset ring-accent bg-accent-soft" : ""}`}
    >
      <td className="px-3 py-2.5 w-[36px]">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              onToggleSelect(entry.path, {
                range: (e.nativeEvent as MouseEvent).shiftKey,
              })
            }
            className="cursor-pointer"
            aria-label={`${entry.name} 선택`}
          />
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Thumbnail kind={entry.kind} path={entry.path} />
          {!displayPrefix && (
            <SpaceLabel
              space={entry.path.startsWith("/personal/") ? "personal" : "team"}
              size="sm"
              withText={false}
            />
          )}
          <span className="text-text truncate">{entry.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-text-soft truncate" title={uploaderName ?? ""}>
        {uploaderName ?? <span className="text-text-faint">—</span>}
      </td>
      <td
        className="px-4 py-2.5 text-text-soft"
        title={new Date(entry.modifiedAt).toLocaleString("ko-KR")}
      >
        <TimeCell ms={entry.modifiedAt} />
      </td>
      <td className="px-4 py-2.5 text-text-soft">
        {entry.isFolder ? "—" : formatSize(entry.size)}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-0.5 items-center">
          <button
            onClick={(e) => onRename(entry, e)}
            title="이름 변경"
            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-text"
          >
            <Pencil size={14} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => onMove(entry, e)}
            title="이동"
            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-text"
          >
            <MoveRight size={14} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => onShare(entry, e)}
            title={entry.isFolder ? "폴더 공유 링크" : "공유 링크"}
            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
          >
            <LinkIcon size={14} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => onDownload(entry, e)}
            title={entry.isFolder ? "ZIP 다운로드" : "다운로드"}
            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
          >
            <Download size={14} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => onDelete(entry, e)}
            title="삭제"
            className="p-1.5 rounded hover:bg-danger-soft text-text-soft hover:text-danger"
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}
