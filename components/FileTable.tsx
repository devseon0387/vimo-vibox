"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileIcon } from "./FileIcon";
import type { FileEntry } from "@/lib/fs/storage";
import { Download, Trash2, Pencil, Link as LinkIcon, MoveRight, FolderOpen } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { usePrompt } from "./PromptDialog";
import { PreviewModal } from "./PreviewModal";
import { MoveDialog } from "./MoveDialog";
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

export function FileTable({
  entries,
  basePath,
}: {
  entries: FileEntry[];
  basePath: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [moveEntry, setMoveEntry] = useState<FileEntry | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { promptInput, dialog: promptDialog } = usePrompt();
  const { show: showToast } = useToast();

  const rows = useMemo(() => entries, [entries]);

  const onOpen = (entry: FileEntry) => {
    if (entry.isFolder) {
      router.push(`/?path=${encodeURIComponent(entry.path)}`);
    } else if (isPreviewable(entry)) {
      setPreviewEntry(entry);
    } else {
      // 미리보기 불가 → 다운로드
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
    const toPath =
      (parent === "/" ? "" : parent) + "/" + newName;
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

  const onShare = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.isFolder) {
      showToast("지금은 폴더 공유를 지원하지 않아요", "error");
      return;
    }
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
      const body = await res.json();
      if (!res.ok) {
        showToast("링크 생성 실패: " + (body.error ?? res.statusText), "error");
        return;
      }
      const url = `${window.location.origin}/s/${body.token}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast(
          <>
            <span className="font-semibold text-white mr-1.5">링크 복사됨</span>
            <span className="text-white/70 text-[12px]">{url}</span>
          </>,
        );
      } catch {
        showToast(
          <>
            <span className="font-semibold text-white mr-1.5">링크 생성됨</span>
            <span className="text-white/70 text-[12px]">{url}</span>
          </>,
        );
      }
    } catch (err) {
      showToast(
        "링크 생성 중 오류: " + (err instanceof Error ? err.message : "unknown"),
        "error",
      );
    }
  };

  const onMove = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setMoveEntry(entry);
  };

  const empty = rows.length === 0;

  return (
    <>
      {empty ? (
        <div className="border border-dashed border-border rounded-lg py-14 px-6 text-center bg-white">
          <FolderOpen
            size={32}
            className="mx-auto text-text-faint mb-3"
            strokeWidth={1.5}
          />
          <div className="text-[14px] text-text-muted">
            {basePath === "/" ? "비어있어요" : "이 폴더가 비어있어요"}
          </div>
          <div className="text-[12px] text-text-faint mt-1">
            파일을 드래그하거나 업로드 버튼을 눌러보세요
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-md overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider">
                  이름
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
              {rows.map((entry) => (
                <tr
                  key={entry.path}
                  onClick={() => onOpen(entry)}
                  className={`border-b border-[#f5f5f5] hover:bg-surface cursor-pointer transition-colors ${
                    deleting === entry.path ? "opacity-40" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <FileIcon kind={entry.kind} />
                      <span className="text-text">{entry.name}</span>
                    </div>
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
                        <>
                          <button
                            onClick={(e) => onShare(entry, e)}
                            title="공유 링크"
                            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
                          >
                            <LinkIcon size={14} strokeWidth={2} />
                          </button>
                          <button
                            onClick={(e) => onDownload(entry, e)}
                            title="다운로드"
                            className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
                          >
                            <Download size={14} strokeWidth={2} />
                          </button>
                        </>
                      )}
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
              ))}
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
        onMoved={() => router.refresh()}
      />
    </>
  );
}
