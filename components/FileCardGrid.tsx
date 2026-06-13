"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { FileEntry } from "@/lib/fs/storage";
import { useLongPress } from "@/lib/use-long-press";
import {
  Download,
  Trash2,
  Pencil,
  Link as LinkIcon,
  MoveRight,
  FolderOpen,
  Folder,
  MessageSquare,
  Image as ImageIcon,
  Music,
  FileText,
  File as FileIconSvg,
  Archive,
} from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { humanError } from "@/lib/human-error";
import { usePrompt } from "./PromptDialog";
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
import { ThumbImg } from "./ThumbImg";
import { directDownloadUrl } from "@/lib/media-route";

function useGridCols(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1024) setCols(5);
      else if (w >= 768) setCols(4);
      else if (w >= 640) setCols(3);
      else setCols(2);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return cols;
}

type FileStats = {
  commentCount: number;
  openCount: number;
  uploaderName?: string | null;
};

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

function NonVideoThumb({ kind }: { kind: FileEntry["kind"] }) {
  const common = "w-10 h-10";
  if (kind === "image") return <ImageIcon className={common} strokeWidth={1.5} />;
  if (kind === "audio") return <Music className={common} strokeWidth={1.5} />;
  if (kind === "doc") return <FileText className={common} strokeWidth={1.5} />;
  if (kind === "zip") return <Archive className={common} strokeWidth={1.5} />;
  return <FileIconSvg className={common} strokeWidth={1.5} />;
}

function VideoThumb({ path }: { path: string }) {
  // 썸네일은 u1/u2 직결(:8443)로 받아 CF(LAX) 지연 우회 — 실패 시 CF 폴백.
  return (
    <ThumbImg
      path={path}
      className="absolute inset-0 w-full h-full object-cover"
      fallback={
        <div className="absolute inset-0 flex items-center justify-center text-white/30">
          <FileIconSvg size={40} strokeWidth={1.5} />
        </div>
      }
    />
  );
}

function Card({
  index,
  entry,
  stats,
  onOpen,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
  onMoveDrop,
  deleting,
  selected,
  focused,
  onToggleSelect,
  selectedPaths,
  hasSelection,
  displayPrefix,
  onFocus,
  onContextMenu,
}: {
  index: number;
  entry: FileEntry;
  stats?: FileStats;
  onOpen: (e: FileEntry) => void;
  onRename: (e: FileEntry, ev?: React.MouseEvent) => void;
  onMove: (e: FileEntry, ev?: React.MouseEvent) => void;
  onShare: (e: FileEntry, ev?: React.MouseEvent) => void;
  onDownload: (e: FileEntry, ev?: React.MouseEvent) => void;
  onDelete: (e: FileEntry, ev?: React.MouseEvent) => void;
  onMoveDrop?: (srcPaths: string[], destDir: string) => void;
  deleting: boolean;
  selected: boolean;
  focused: boolean;
  onToggleSelect?: (
    path: string,
    opts?: { range?: boolean; toggle?: boolean },
  ) => void;
  selectedPaths?: Set<string>;
  hasSelection: boolean;
  displayPrefix?: string;
  onFocus: () => void;
  onContextMenu: (entry: FileEntry, ev: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  // 드래그 소스 (파일·폴더 공통)
  const dragStart = (e: React.DragEvent) => {
    if ((e.target as HTMLElement).closest("input,button")) {
      e.preventDefault();
      return;
    }
    startInternalDrag(e, entry.path, selectedPaths);
  };
  const longPress = useLongPress(
    () => {
      if (onToggleSelect) onToggleSelect(entry.path, { toggle: true });
    },
    { delayMs: 500 },
  );
  const handleClick = (e: React.MouseEvent) => {
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
    if (hasSelection && onToggleSelect) {
      onToggleSelect(entry.path);
      return;
    }
    onOpen(entry);
  };
  const SelectCheckbox = onToggleSelect ? (
    <div
      className={`absolute top-1.5 left-1.5 z-10 ${selected || hover ? "opacity-100" : "opacity-0"} transition-opacity`}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onToggleSelect(entry.path, {
            range: (e.nativeEvent as MouseEvent).shiftKey,
          })
        }
        className="cursor-pointer w-4 h-4"
        aria-label={`${entry.name} 선택`}
      />
    </div>
  ) : null;

  if (entry.isFolder) {
    return (
      <div
        data-card-idx={index}
        draggable
        onDragStart={dragStart}
        onDragEnd={endInternalDrag}
        onDragOver={(e) => {
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
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`group cursor-pointer select-none ${deleting ? "opacity-40" : ""}`}
      >
        <div
          className={`aspect-[16/10] bg-surface border rounded-lg flex items-center justify-center mb-2 transition-colors relative ${
            dropHover
              ? "border-accent ring-2 ring-accent bg-accent-soft"
              : selected
                ? "border-accent ring-2 ring-accent/30"
                : focused
                  ? "border-accent ring-2 ring-accent/50"
                  : "border-border group-hover:border-border-hover"
          }`}
        >
          {SelectCheckbox}
          <Folder className="w-12 h-12 text-amber-400" strokeWidth={1.5} />
          {hover && (
            <div className="absolute top-1.5 right-1.5 flex gap-0.5 bg-white/95 backdrop-blur rounded-md border border-border shadow-sm">
              <button
                onClick={(e) => onRename(entry, e)}
                title="이름 변경"
                className="p-1 text-text-soft hover:text-text"
              >
                <Pencil size={12} strokeWidth={2} />
              </button>
              <button
                onClick={(e) => onMove(entry, e)}
                title="이동"
                className="p-1 text-text-soft hover:text-text"
              >
                <MoveRight size={12} strokeWidth={2} />
              </button>
              <button
                onClick={(e) => onShare(entry, e)}
                title="폴더 공유 링크"
                className="p-1 text-text-soft hover:text-accent"
              >
                <LinkIcon size={12} strokeWidth={2} />
              </button>
              <button
                onClick={(e) => onDelete(entry, e)}
                title="삭제"
                className="p-1 text-text-soft hover:text-danger"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
        <div className="px-0.5">
          <div className="text-[13px] font-medium text-text truncate">{entry.name}</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">폴더</div>
        </div>
      </div>
    );
  }

  const isVid = isVideo(entry);

  return (
    <div
      data-card-idx={index}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(entry, e)}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group cursor-pointer select-none ${deleting ? "opacity-40" : ""}`}
    >
      <div
        className={`aspect-[16/10] rounded-lg overflow-hidden mb-2 relative border transition-colors ${
          selected
            ? "border-accent ring-2 ring-accent/30"
            : focused
              ? "border-accent ring-2 ring-accent/50"
              : "border-border group-hover:border-border-hover"
        } ${isVid ? "bg-black" : "bg-surface"}`}
      >
        {SelectCheckbox}
        {isVid ? (
          <VideoThumb path={entry.path} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-faint">
            <NonVideoThumb kind={entry.kind} />
          </div>
        )}

        <div className="absolute top-1.5 left-1.5 flex gap-1 items-center">
          {!displayPrefix && (
            <SpaceLabel
              space={entry.path.startsWith("/personal/") ? "personal" : "team"}
              size="sm"
              withText={false}
            />
          )}
          {stats && stats.commentCount > 0 && (
            <>
              <span className="bg-black/70 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 backdrop-blur-sm">
                <MessageSquare size={10} strokeWidth={2.5} />
                {stats.commentCount}
              </span>
              {stats.openCount > 0 && (
                <span className="bg-amber-500 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded">
                  {stats.openCount} 남음
                </span>
              )}
            </>
          )}
        </div>

        {hover && (
          <div className="absolute top-1.5 right-1.5 flex gap-0.5 bg-white/95 backdrop-blur rounded-md border border-border shadow-sm">
            <button
              onClick={(e) => onRename(entry, e)}
              title="이름 변경"
              className="p-1 text-text-soft hover:text-text"
            >
              <Pencil size={12} strokeWidth={2} />
            </button>
            <button
              onClick={(e) => onMove(entry, e)}
              title="이동"
              className="p-1 text-text-soft hover:text-text"
            >
              <MoveRight size={12} strokeWidth={2} />
            </button>
            <button
              onClick={(e) => onShare(entry, e)}
              title="공유 링크"
              className="p-1 text-text-soft hover:text-accent"
            >
              <LinkIcon size={12} strokeWidth={2} />
            </button>
            <button
              onClick={(e) => onDownload(entry, e)}
              title="다운로드"
              className="p-1 text-text-soft hover:text-accent"
            >
              <Download size={12} strokeWidth={2} />
            </button>
            <button
              onClick={(e) => onDelete(entry, e)}
              title="삭제"
              className="p-1 text-text-soft hover:text-danger"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
      <div className="px-0.5">
        <div className="text-[13px] font-medium text-text truncate" title={entry.name}>
          {entry.name}
        </div>
        <div className="text-[11.5px] text-text-muted mt-0.5 truncate">
          {stats?.uploaderName && (
            <>
              <span className="text-text-soft">{stats.uploaderName}</span>
              {" · "}
            </>
          )}
          <TimeCell ms={entry.modifiedAt} /> · {formatSize(entry.size)}
        </div>
      </div>
    </div>
  );
}

export function FileCardGrid({
  entries,
  basePath,
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
  onOptimisticHide?: (paths: string[]) => void;
  onOptimisticUnhide?: (paths: string[]) => void;
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
  const gridRef = useRef<HTMLDivElement>(null);
  const cols = useGridCols();

  const onOpen = (entry: FileEntry) => {
    if (entry.isFolder) {
      // 현재 라우트(/team·/my/box 등) 유지하며 폴더 진입. 개인 드라이브는 prefix 가림.
      const target = stripDisplayPrefix(entry.path, displayPrefix);
      router.push(`${pathname}?path=${encodeURIComponent(target)}`);
    } else if (isVideo(entry) && !displayPrefix) {
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

  const onPreviewNavigate = (direction: -1 | 1) => {
    if (!previewEntry) return;
    const previewables = entries.filter(isPreviewableEntry);
    if (previewables.length === 0) return;
    const idx = previewables.findIndex((e) => e.path === previewEntry.path);
    if (idx < 0) return;
    const nextIdx = (idx + direction + previewables.length) % previewables.length;
    const next = previewables[nextIdx];
    setPreviewEntry(next);
    const cardIdx = entries.findIndex((e) => e.path === next.path);
    if (cardIdx >= 0) setFocusedIndex(cardIdx);
  };

  useEffect(() => {
    if (previewEntry) return;
    if (moveEntry || shareEntry) return;
    if (ctxMenu) return;
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
      if (entries.length === 0) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.min(entries.length - 1, i + 1)));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.max(0, i - 1)));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => {
            if (i === null) return 0;
            return Math.min(entries.length - 1, i + cols);
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => {
            if (i === null) return 0;
            return Math.max(0, i - cols);
          });
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(entries.length - 1);
          break;
        case "Enter":
          if (focusedIndex !== null && focusedIndex < entries.length) {
            e.preventDefault();
            onOpen(entries[focusedIndex]);
          }
          break;
        case " ":
          if (focusedIndex !== null && focusedIndex < entries.length) {
            const entry = entries[focusedIndex];
            if (isPreviewableEntry(entry)) {
              e.preventDefault();
              setPreviewEntry(entry);
            }
          }
          break;
        case "F2":
          if (focusedIndex !== null && focusedIndex < entries.length) {
            e.preventDefault();
            onRename(entries[focusedIndex]);
          }
          break;
        case "Delete":
        case "Backspace":
          if (focusedIndex !== null && focusedIndex < entries.length) {
            e.preventDefault();
            onDelete(entries[focusedIndex]);
          }
          break;
        case "Escape":
          if (focusedIndex !== null) setFocusedIndex(null);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEntry, moveEntry, shareEntry, ctxMenu, focusedIndex, entries, cols]);

  useEffect(() => {
    if (focusedIndex === null || !gridRef.current) return;
    const card = gridRef.current.querySelector<HTMLDivElement>(
      `[data-card-idx="${focusedIndex}"]`,
    );
    card?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  useEffect(() => {
    if (focusedIndex === null) return;
    if (focusedIndex >= entries.length) {
      setFocusedIndex(entries.length === 0 ? null : entries.length - 1);
    }
  }, [entries.length, focusedIndex]);

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

    onOptimisticHide?.([entry.path]);
    setDeleting(entry.path);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
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
    const toPath = (parent === "/" ? "" : parent) + "/" + newName;
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

  const onCardContextMenu = (entry: FileEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = entries.findIndex((r) => r.path === entry.path);
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

  if (entries.length === 0) {
    return (
      <>
        <EmptyState
          currentPath={basePath}
          isRoot={basePath === "/" || basePath === displayPrefix}
          onUploadClick={onEmptyUploadClick}
        />
        {confirmDialog}
        {promptDialog}
      </>
    );
  }

  return (
    <>
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 md:gap-4"
      >
        {entries.map((entry, idx) => (
          <Card
            key={entry.path}
            index={idx}
            entry={entry}
            stats={stats?.[entry.path]}
            onOpen={onOpen}
            onRename={onRename}
            onMove={onMove}
            onShare={onShare}
            onDownload={onDownload}
            onDelete={onDelete}
            onMoveDrop={onMoveDrop}
            deleting={deleting === entry.path}
            selected={selectedPaths?.has(entry.path) ?? false}
            focused={focusedIndex === idx}
            onToggleSelect={onToggleSelect}
            selectedPaths={selectedPaths}
            hasSelection={(selectedPaths?.size ?? 0) > 0}
            displayPrefix={displayPrefix}
            onFocus={() => setFocusedIndex(idx)}
            onContextMenu={onCardContextMenu}
          />
        ))}
      </div>

      {confirmDialog}
      {promptDialog}
      <PreviewModal
        entry={previewEntry}
        open={!!previewEntry}
        onClose={() => setPreviewEntry(null)}
        entries={entries}
        onNavigate={onPreviewNavigate}
      />
      <MoveDialog
        entry={moveEntry}
        open={!!moveEntry}
        onClose={() => setMoveEntry(null)}
        displayPrefix={displayPrefix}
        onMoved={() => {
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
