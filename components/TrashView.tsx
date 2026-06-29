"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, AlertCircle } from "lucide-react";
import { FileIcon, type FileKind } from "./FileIcon";
import type { TrashRow } from "@/lib/fs/trash";
import { humanError } from "@/lib/human-error";
import { useConfirm } from "./ConfirmDialog";
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

function formatDeletedAt(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - ms) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return `오늘 ${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function kindFromName(name: string, isFolder: boolean): FileKind {
  if (isFolder) return "folder";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "mkv", "avi", "webm", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp"].includes(ext)) return "image";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "zip";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv"].includes(ext)) return "doc";
  return "other";
}

function daysLeft(deletedAt: number): number {
  const elapsed = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsed);
}

export function TrashView({
  items,
  isAdmin,
}: {
  items: TrashRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const onRestore = async (item: TrashRow) => {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(humanError(body.error ?? res.statusText, "trash-restore"));
        return;
      }
      success(
        <>
          <span className="font-semibold">{item.name}</span> 복원됨
        </>,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onPermanentDelete = async (item: TrashRow) => {
    const ok = await confirm({
      title: "영구 삭제할까요?",
      message: item.isFolder
        ? "이 폴더와 그 안의 파일이 완전히 사라져요. 되돌릴 수 없어요."
        : "이 파일이 완전히 사라져요. 되돌릴 수 없어요.",
      highlight: item.name,
      confirmLabel: "영구 삭제",
      tone: "danger",
      icon: Trash2,
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "trash-permanent"));
        return;
      }
      success(
        <>
          <span className="font-semibold">{item.name}</span> 영구 삭제됨
        </>,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onEmptyAll = async () => {
    const ok = await confirm({
      title: "휴지통을 비울까요?",
      message: "휴지통 안의 모든 파일이 완전히 사라져요. 되돌릴 수 없어요.",
      highlight: `파일 ${items.length}개`,
      confirmLabel: "전부 비우기",
      tone: "danger",
      icon: Trash2,
    });
    if (!ok) return;
    const res = await fetch("/api/trash", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toastError(humanError(body.error ?? res.statusText, "trash-permanent"));
      return;
    }
    success("휴지통을 비웠어요");
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">휴지통</h1>
          <p className="text-sm text-text-faint mt-1">
            삭제한 파일은 30일 뒤 자동으로 영구 삭제됩니다
          </p>
        </div>
        {isAdmin && items.length > 0 && (
          <button
            onClick={onEmptyAll}
            className="text-base font-semibold text-danger hover:bg-danger-soft px-3 py-1.5 rounded-md border border-[#fee2e2] flex items-center gap-1.5"
          >
            <Trash2 size={14} strokeWidth={2} />
            전부 비우기
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Trash2 size={32} className="mx-auto text-text-faint mb-3" strokeWidth={1.5} />
          <div className="text-md text-text-muted">휴지통이 비어 있어요</div>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto bg-white">
          <table className="w-full min-w-[780px] text-base">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[200px]">
                  원래 위치
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[130px]">
                  지운 사람
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[140px]">
                  지운 날짜
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[90px]">
                  크기
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[130px]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const remaining = daysLeft(item.deletedAt);
                const parentPath = item.originalPath.split("/").slice(0, -1).join("/") || "/";
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-[#f5f5f5] hover:bg-surface transition-colors ${
                      busy === item.id ? "opacity-40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <FileIcon kind={kindFromName(item.name, item.isFolder)} />
                        <span className="text-text truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-text-faint text-sm truncate">
                      {parentPath}
                    </td>
                    <td className="px-4 py-2.5 text-text-soft truncate">{item.deletedByName}</td>
                    <td className="px-4 py-2.5 text-text-soft">
                      <div>{formatDeletedAt(item.deletedAt)}</div>
                      {remaining <= 7 && (
                        <div className="text-xs text-warning flex items-center gap-1 mt-0.5">
                          <AlertCircle size={11} />
                          {remaining}일 뒤 영구삭제
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-soft">
                      {item.isFolder ? "—" : formatSize(item.size)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-0.5 items-center">
                        <button
                          onClick={() => onRestore(item)}
                          disabled={busy === item.id}
                          title="복원"
                          className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent disabled:opacity-50"
                        >
                          <RotateCcw size={14} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => onPermanentDelete(item)}
                          disabled={busy === item.id}
                          title="영구 삭제"
                          className="p-1.5 rounded hover:bg-danger-soft text-text-soft hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog}
    </>
  );
}
