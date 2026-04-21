"use client";

import { Modal } from "./Modal";
import type { FileEntry } from "@/lib/fs/storage";
import { Download } from "lucide-react";

function isImage(k: FileEntry["kind"]) {
  return k === "image";
}
function isVideo(k: FileEntry["kind"]) {
  return k === "video";
}
function isPdf(entry: FileEntry) {
  return entry.name.toLowerCase().endsWith(".pdf");
}
function isAudio(k: FileEntry["kind"]) {
  return k === "audio";
}

export function PreviewModal({
  entry,
  open,
  onClose,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;
  const src = `/api/download?path=${encodeURIComponent(entry.path)}&inline=1`;

  let body: React.ReactNode;
  if (isImage(entry.kind)) {
    body = (
      <div className="bg-[#1a1a1a] grid place-items-center py-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={entry.name} className="max-w-full max-h-[75vh] object-contain" />
      </div>
    );
  } else if (isVideo(entry.kind)) {
    const poster = `/api/thumb?path=${encodeURIComponent(entry.path)}`;
    body = (
      <div className="bg-black grid place-items-center">
        <video
          src={src}
          poster={poster}
          controls
          preload="auto"
          className="max-w-full max-h-[75vh]"
        />
      </div>
    );
  } else if (isAudio(entry.kind)) {
    body = (
      <div className="p-8 bg-surface grid place-items-center">
        <audio src={src} controls className="w-full" />
      </div>
    );
  } else if (isPdf(entry)) {
    body = (
      <div className="h-[75vh] bg-[#1a1a1a]">
        <iframe
          src={src}
          className="w-full h-full border-0"
          title={entry.name}
        />
      </div>
    );
  } else {
    body = (
      <div className="p-12 text-center">
        <div className="text-[14px] text-text-muted mb-6">
          이 파일은 브라우저에서 미리볼 수 없습니다
        </div>
        <a
          href={`/api/download?path=${encodeURIComponent(entry.path)}`}
          download={entry.name}
          className="inline-flex items-center gap-2 bg-accent text-white px-5 py-2.5 rounded-md text-[14px] font-semibold hover:bg-accent-hover"
        >
          <Download size={15} strokeWidth={2.5} />
          다운로드
        </a>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.name}
      maxWidth="max-w-5xl"
    >
      {body}
    </Modal>
  );
}
