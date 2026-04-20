"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderPlus } from "lucide-react";
import { usePrompt } from "./PromptDialog";
import { useToast } from "./Toast";

export function ActionBar({
  currentPath,
  onUpload,
  uploading,
}: {
  currentPath: string;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { promptInput, dialog } = usePrompt();
  const toast = useToast();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onUpload(Array.from(fileList));
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleNewFolder = async () => {
    const name = await promptInput({
      title: "새 폴더",
      placeholder: "폴더 이름",
      confirmLabel: "만들기",
      validate: (v) => {
        if (!/^[^/\\:*?"<>|]+$/.test(v)) return "이름에 사용할 수 없는 문자가 있습니다";
        return null;
      },
    });
    if (!name) return;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath, name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error("폴더 생성 실패: " + (body.error ?? res.statusText));
      return;
    }
    toast.success(
      <>
        폴더 <span className="font-semibold">{name}</span> 생성됨
      </>,
    );
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="bg-text text-white hover:bg-[#333] disabled:opacity-60 transition-colors px-3.5 py-2 rounded-md text-[13px] font-semibold flex items-center gap-1.5"
        >
          <Upload size={14} strokeWidth={2.5} />
          업로드
        </button>
        <button
          onClick={handleNewFolder}
          className="bg-white border border-border hover:border-border-hover text-text-muted hover:text-text transition-colors px-3.5 py-2 rounded-md text-[13px] font-medium flex items-center gap-1.5"
        >
          <FolderPlus size={14} strokeWidth={2} /> 새 폴더
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {dialog}
    </>
  );
}
