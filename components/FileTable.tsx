"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLongPress } from "@/lib/use-long-press";
import { Thumbnail } from "./Thumbnail";
import type { FileEntry } from "@/lib/fs/storage";
import { Download, Trash2, Pencil, Link as LinkIcon, MoveRight, Upload as UploadIcon } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { usePrompt } from "./PromptDialog";
import { humanError } from "@/lib/human-error";
import { PreviewModal } from "./PreviewModal";
import { MoveDialog } from "./MoveDialog";
import { ShareDialog } from "./ShareDialog";
import { useToast } from "./Toast";

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
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [moveEntry, setMoveEntry] = useState<FileEntry | null>(null);
  const [shareEntry, setShareEntry] = useState<FileEntry | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { promptInput, dialog: promptDialog } = usePrompt();
  const { show: showToast } = useToast();

  const rows = useMemo(() => entries, [entries]);

  const onOpen = (entry: FileEntry) => {
    if (entry.isFolder) {
      router.push(`/?path=${encodeURIComponent(entry.path)}`);
    } else if (isVideo(entry)) {
      router.push(`/vimo-box?path=${encodeURIComponent(entry.path)}`);
    } else if (isPreviewable(entry)) {
      setPreviewEntry(entry);
    } else {
      window.open(`/api/download?path=${encodeURIComponent(entry.path)}`, "_self");
    }
  };

  const onDelete = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const onRename = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const onDownload = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement("a");
    if (entry.isFolder) {
      a.href = `/api/download/zip?path=${encodeURIComponent(entry.path)}`;
      a.download = `${entry.name}.zip`;
    } else {
      a.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
      a.download = entry.name;
    }
    a.click();
  };

  const onShare = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.isFolder) {
      showToast("지금은 폴더 공유를 지원하지 않아요", "error");
      return;
    }
    setShareEntry(entry);
  };

  const onMove = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setMoveEntry(entry);
  };

  const empty = rows.length === 0;

  return (
    <>
      {empty ? (
        <div className="border-2 border-dashed border-border rounded-xl py-16 px-6 text-center bg-white hover:border-accent/40 transition-colors">
          <div className="mx-auto w-14 h-14 rounded-full bg-accent-soft text-accent grid place-items-center mb-4">
            <UploadIcon size={26} strokeWidth={2} />
          </div>
          <div className="text-[15px] font-semibold text-text mb-1">
            {basePath === "/" ? "아직 파일이 없어요" : "이 폴더가 비어있어요"}
          </div>
          <div className="text-[12.5px] text-text-muted">
            파일을 여기로 끌어다 놓거나 위쪽{" "}
            <span className="font-semibold text-text">업로드</span> 버튼을 눌러주세요
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-md overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13.5px]">
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
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[120px]">
                  업로더
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[140px]">
                  수정일
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[100px]">
                  크기
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[170px]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const isSelected = selectedPaths?.has(entry.path) ?? false;
                return (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  uploaderName={stats?.[entry.path]?.uploaderName ?? null}
                  isSelected={isSelected}
                  deleting={deleting === entry.path}
                  selectedPaths={selectedPaths}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                  onRename={onRename}
                  onMove={onMove}
                  onShare={onShare}
                  onDownload={onDownload}
                  onDelete={onDelete}
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
      />
      <MoveDialog
        entry={moveEntry}
        open={!!moveEntry}
        onClose={() => setMoveEntry(null)}
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
    </>
  );
}

function FileRow({
  entry,
  uploaderName,
  isSelected,
  deleting,
  selectedPaths,
  onToggleSelect,
  onOpen,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
}: {
  entry: FileEntry;
  uploaderName?: string | null;
  isSelected: boolean;
  deleting: boolean;
  selectedPaths?: Set<string>;
  onToggleSelect?: (
    path: string,
    opts?: { range?: boolean; toggle?: boolean },
  ) => void;
  onOpen: (e: FileEntry) => void;
  onRename: (e: FileEntry, ev: React.MouseEvent) => void;
  onMove: (e: FileEntry, ev: React.MouseEvent) => void;
  onShare: (e: FileEntry, ev: React.MouseEvent) => void;
  onDownload: (e: FileEntry, ev: React.MouseEvent) => void;
  onDelete: (e: FileEntry, ev: React.MouseEvent) => void;
}) {
  const longPress = useLongPress(
    () => {
      if (onToggleSelect) onToggleSelect(entry.path, { toggle: true });
    },
    { delayMs: 500 },
  );

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (longPress.consumedClick()) return;
    if ((e.target as HTMLElement).closest("input[type=checkbox]")) return;
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
      onClick={handleClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      className={`border-b border-[#f5f5f5] hover:bg-surface cursor-pointer transition-colors select-none ${
        deleting ? "opacity-40" : ""
      } ${isSelected ? "bg-accent-soft hover:bg-accent-soft" : ""}`}
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
        <div className="flex items-center gap-2.5">
          <Thumbnail kind={entry.kind} path={entry.path} />
          <span className="text-text">{entry.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-text-soft truncate" title={uploaderName ?? ""}>
        {uploaderName ?? <span className="text-text-faint">—</span>}
      </td>
      <td
        className="px-4 py-2.5 text-text-soft"
        title={new Date(entry.modifiedAt).toLocaleString("ko-KR")}
      >
        {formatTime(entry.modifiedAt)}
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
          {!entry.isFolder && (
            <button
              onClick={(e) => onShare(entry, e)}
              title="공유 링크"
              className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
            >
              <LinkIcon size={14} strokeWidth={2} />
            </button>
          )}
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
