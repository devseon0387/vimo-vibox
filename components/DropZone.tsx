"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

/** 파일이 body로 드래그될 때 오버레이 띄우고, 드롭 시 onFiles 호출. */
export function DropZone({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [over, setOver] = useState(false);

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
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter = 0;
      setVisible(false);
      setOver(false);
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

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      onDragEnter={() => setOver(true)}
      onDragLeave={() => setOver(false)}
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
