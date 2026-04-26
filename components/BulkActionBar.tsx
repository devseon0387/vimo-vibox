"use client";

import { useRouter } from "next/navigation";
import { Download, Trash2, MoveRight, X } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { useState } from "react";
import { MoveDialog } from "./MoveDialog";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: FileEntry[];
  onClear: () => void;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const [moveOpen, setMoveOpen] = useState(false);

  if (selected.length === 0) return null;

  const totalBytes = selected
    .filter((e) => !e.isFolder)
    .reduce((s, e) => s + e.size, 0);
  const folderCount = selected.filter((e) => e.isFolder).length;
  const fileCount = selected.length - folderCount;

  const onDownload = () => {
    const paths = selected.map((e) => encodeURIComponent(e.path)).join(",");
    const a = document.createElement("a");
    a.href = `/api/download/zip?paths=${paths}`;
    a.click();
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `${selected.length}개 항목 삭제`,
      message: (
        <>
          선택한 {fileCount > 0 && `파일 ${fileCount}개`}
          {fileCount > 0 && folderCount > 0 && ", "}
          {folderCount > 0 && `폴더 ${folderCount}개`}를 휴지통으로 옮겨요.
          <br />
          30일 이내에 언제든 복원할 수 있어요.
        </>
      ),
      confirmLabel: "휴지통으로",
      variant: "danger",
    });
    if (!ok) return;

    let success = 0;
    let failed = 0;
    const trashIds: string[] = [];
    for (const entry of selected) {
      try {
        const res = await fetch(
          `/api/files?path=${encodeURIComponent(entry.path)}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          success++;
          const body = await res.json().catch(() => ({}));
          if (body?.trashId) trashIds.push(body.trashId);
        } else failed++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      toast.success(`${success}개 항목 삭제됨`, {
        action:
          trashIds.length > 0
            ? {
                label: "모두 되돌리기",
                onClick: async () => {
                  let restored = 0;
                  for (const id of trashIds) {
                    try {
                      const r = await fetch(`/api/trash/${id}`, {
                        method: "POST",
                      });
                      if (r.ok) restored++;
                    } catch {}
                  }
                  toast.info(`${restored}개 복원됨`);
                  router.refresh();
                },
              }
            : undefined,
      });
    } else {
      toast.error(`${success}개 삭제, ${failed}개 실패`);
    }
    onClear();
    router.refresh();
  };

  return (
    <>
      <div className="sticky top-0 md:top-2 z-20 bg-white border border-border rounded-lg shadow-md mb-3 px-3 py-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={onClear}
          className="p-1 rounded hover:bg-hover text-text-soft"
          title="선택 해제 (Esc)"
        >
          <X size={15} strokeWidth={2.2} />
        </button>
        <span className="text-[13px] font-semibold text-text">
          {selected.length}개 선택
        </span>
        {totalBytes > 0 && (
          <span className="text-[12px] text-text-soft">
            · {formatSize(totalBytes)}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={onDownload}
          className="px-3 py-1.5 rounded-md bg-white border border-border hover:border-border-hover text-text text-[12.5px] font-semibold inline-flex items-center gap-1.5"
        >
          <Download size={13} strokeWidth={2.2} /> ZIP 다운
        </button>
        <button
          onClick={() => setMoveOpen(true)}
          className="px-3 py-1.5 rounded-md bg-white border border-border hover:border-border-hover text-text text-[12.5px] font-semibold inline-flex items-center gap-1.5"
        >
          <MoveRight size={13} strokeWidth={2.2} /> 이동
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-md bg-white border border-border hover:border-danger text-danger hover:bg-danger-soft text-[12.5px] font-semibold inline-flex items-center gap-1.5"
        >
          <Trash2 size={13} strokeWidth={2.2} /> 삭제
        </button>
      </div>
      {dialog}
      <MoveDialog
        entry={selected[0] ?? null}
        additionalEntries={selected.length > 1 ? selected.slice(1) : undefined}
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        onMoved={() => {
          setMoveOpen(false);
          onClear();
          router.refresh();
        }}
      />
    </>
  );
}
