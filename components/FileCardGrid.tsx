"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry } from "@/lib/fs/storage";
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
import { usePrompt } from "./PromptDialog";
import { PreviewModal } from "./PreviewModal";
import { MoveDialog } from "./MoveDialog";
import { ShareDialog } from "./ShareDialog";
import { useToast } from "./Toast";

type FileStats = { commentCount: number; openCount: number };

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
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-white/30">
        <FileIconSvg size={40} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={`/api/thumb?path=${encodeURIComponent(path)}`}
      alt=""
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function Card({
  entry,
  stats,
  onOpen,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
  deleting,
}: {
  entry: FileEntry;
  stats?: FileStats;
  onOpen: (e: FileEntry) => void;
  onRename: (e: FileEntry, ev: React.MouseEvent) => void;
  onMove: (e: FileEntry, ev: React.MouseEvent) => void;
  onShare: (e: FileEntry, ev: React.MouseEvent) => void;
  onDownload: (e: FileEntry, ev: React.MouseEvent) => void;
  onDelete: (e: FileEntry, ev: React.MouseEvent) => void;
  deleting: boolean;
}) {
  const [hover, setHover] = useState(false);

  if (entry.isFolder) {
    return (
      <div
        onClick={() => onOpen(entry)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`group cursor-pointer ${deleting ? "opacity-40" : ""}`}
      >
        <div className="aspect-[16/10] bg-surface border border-border rounded-lg flex items-center justify-center mb-2 group-hover:border-border-hover transition-colors relative">
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
      onClick={() => onOpen(entry)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group cursor-pointer ${deleting ? "opacity-40" : ""}`}
    >
      <div
        className={`aspect-[16/10] rounded-lg overflow-hidden mb-2 relative border border-border group-hover:border-border-hover transition-colors ${
          isVid ? "bg-black" : "bg-surface"
        }`}
      >
        {isVid ? (
          <VideoThumb path={entry.path} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-faint">
            <NonVideoThumb kind={entry.kind} />
          </div>
        )}

        {stats && stats.commentCount > 0 && (
          <div className="absolute top-1.5 left-1.5 flex gap-1">
            <span className="bg-black/70 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 backdrop-blur-sm">
              <MessageSquare size={10} strokeWidth={2.5} />
              {stats.commentCount}
            </span>
            {stats.openCount > 0 && (
              <span className="bg-amber-500 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded">
                {stats.openCount} 남음
              </span>
            )}
          </div>
        )}

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
        <div className="text-[11.5px] text-text-muted mt-0.5">
          {formatTime(entry.modifiedAt)} · {formatSize(entry.size)}
        </div>
      </div>
    </div>
  );
}

export function FileCardGrid({
  entries,
  stats,
}: {
  entries: FileEntry[];
  basePath: string;
  session?: { id: string; isAdmin: boolean };
  stats?: Record<string, FileStats>;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [moveEntry, setMoveEntry] = useState<FileEntry | null>(null);
  const [shareEntry, setShareEntry] = useState<FileEntry | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { promptInput, dialog: promptDialog } = usePrompt();
  const { show: showToast } = useToast();

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

    setDeleting(entry.path);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast("삭제 실패: " + (body.error ?? res.statusText), "error");
        return;
      }
      showToast(
        <>
          <span className="font-semibold">{entry.name}</span> 삭제됨
        </>,
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
    const toPath = (parent === "/" ? "" : parent) + "/" + newName;
    const res = await fetch("/api/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: entry.path, to: toPath }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast("이름 변경 실패: " + (body.error ?? res.statusText), "error");
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
    if (entry.isFolder) return;
    const a = document.createElement("a");
    a.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
    a.download = entry.name;
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

  if (entries.length === 0) {
    return (
      <>
        <div className="border border-dashed border-border rounded-lg py-14 px-6 text-center bg-white">
          <FolderOpen
            size={32}
            className="mx-auto text-text-faint mb-3"
            strokeWidth={1.5}
          />
          <div className="text-[14px] text-text-muted">비어있어요</div>
          <div className="text-[12px] text-text-faint mt-1">
            파일을 드래그하거나 업로드 버튼을 눌러보세요
          </div>
        </div>
        {confirmDialog}
        {promptDialog}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {entries.map((entry) => (
          <Card
            key={entry.path}
            entry={entry}
            stats={stats?.[entry.path]}
            onOpen={onOpen}
            onRename={onRename}
            onMove={onMove}
            onShare={onShare}
            onDownload={onDownload}
            onDelete={onDelete}
            deleting={deleting === entry.path}
          />
        ))}
      </div>

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
        onMoved={() => router.refresh()}
      />
      <ShareDialog
        entry={shareEntry}
        open={!!shareEntry}
        onClose={() => setShareEntry(null)}
      />
    </>
  );
}
