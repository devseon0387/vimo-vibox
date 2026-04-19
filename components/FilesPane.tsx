"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry } from "@/lib/fs/storage";
import { ActionBar } from "./ActionBar";
import { DropZone } from "./DropZone";
import { FileTable } from "./FileTable";
import { UploadProgress, type UploadState } from "./UploadProgress";
import { startUpload } from "@/lib/upload";
import { useToast } from "./Toast";

export function FilesPane({
  entries,
  currentPath,
}: {
  entries: FileEntry[];
  currentPath: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

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
        (stats) => {
          setUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  peakBytesPerSec: stats.peakBytesPerSec,
                  chunksByShard: { ...stats.chunksByShard },
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
      <ActionBar
        currentPath={currentPath}
        onUpload={doUpload}
        uploading={!!uploadState}
      />
      <FileTable entries={entries} basePath={currentPath} />
      <DropZone onFiles={doUpload} />
      <UploadProgress
        state={uploadState}
        onCancel={() => cancelRef.current?.()}
      />
    </>
  );
}
