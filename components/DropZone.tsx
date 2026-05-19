"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

type FilePathed = File & { __relPath?: string };

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: File[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject),
    );
    const rel = prefix ? `${prefix}/${file.name}` : file.name;
    Object.assign(file, { __relPath: rel } as Partial<FilePathed>);
    out.push(file);
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    // readEntries 는 한 번에 100개만 → 빌 때까지 반복
    while (true) {
      const batch: FileSystemEntry[] = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) {
        await walkEntry(child, newPrefix, out);
      }
    }
  }
}

const FADE_MS = 150;

/** 파일이 body로 드래그될 때 오버레이 띄우고, 드롭 시 onFiles 호출. */
export function DropZone({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [over, setOver] = useState(false);

  // visible 변화에 따라 mount/exit 처리
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      const t = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, FADE_MS);
      return () => clearTimeout(t);
    }
  }, [visible, mounted]);

  useEffect(() => {
    let dragCounter = 0;

    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter++;
      setVisible(true);
    };
    const onLeave = () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setVisible(false);
        setOver(false);
      }
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter = 0;
      setVisible(false);
      setOver(false);

      // 폴더 드래그 지원: webkitGetAsEntry 로 재귀 순회 (가능한 경우)
      const items = e.dataTransfer?.items;
      if (items && items.length > 0 && "webkitGetAsEntry" in items[0]) {
        const out: File[] = [];
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i].webkitGetAsEntry?.();
          if (it) entries.push(it);
        }
        for (const ent of entries) {
          await walkEntry(ent, "", out);
        }
        if (out.length > 0) onFiles(out);
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      onDragEnter={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      style={{
        animation: exiting
          ? `fade-out ${FADE_MS}ms ease-in both`
          : `fade-in ${FADE_MS}ms ease-out both`,
      }}
    >
      <div
        className={`absolute inset-4 rounded-2xl border-4 border-dashed transition-colors ${
          over
            ? "border-accent bg-accent-soft/60"
            : "border-accent/40 bg-accent-soft/30"
        }`}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Upload size={48} strokeWidth={2} className="text-accent mb-4" />
          <div className="text-[18px] font-bold text-accent mb-1">
            여기에 놓으면 업로드됩니다
          </div>
          <div className="text-[13px] text-text-soft">
            현재 폴더에 파일이 추가됩니다
          </div>
        </div>
      </div>
    </div>
  );
}
