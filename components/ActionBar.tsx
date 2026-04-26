"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderPlus, FolderUp } from "lucide-react";
import { usePrompt } from "./PromptDialog";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";

// FilePathed: 폴더 업로드 시 webkitRelativePath 보존
export type FilePathed = File & { __relPath?: string };

export function ActionBar({
  currentPath,
  onUpload,
  uploading,
  /** 새 폴더 만들기 비활성 (예: 렌더링 zone root). 기본 false */
  disableNewFolder,
}: {
  currentPath: string;
  onUpload: (files: FilePathed[]) => void;
  uploading: boolean;
  disableNewFolder?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const { promptInput, dialog } = usePrompt();
  const toast = useToast();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onUpload(Array.from(fileList));
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFolder = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // webkitRelativePath = "myFolder/sub/file.mp4" 형식. 빈 값이면 일반 파일
    const tagged: FilePathed[] = Array.from(fileList).map((f) => {
      const rel = (f as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      return Object.assign(f, { __relPath: rel || undefined });
    });
    onUpload(tagged);
    if (folderInputRef.current) folderInputRef.current.value = "";
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
      toast.error(humanError(body.error ?? res.statusText, "general"));
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="bg-text text-white hover:bg-[#333] disabled:opacity-60 transition-colors px-3.5 py-2 rounded-md text-[13px] font-semibold flex items-center gap-1.5"
        >
          <Upload size={14} strokeWidth={2.5} />
          업로드
        </button>
        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={uploading}
          title="폴더 통째로 업로드 (구조 보존)"
          className="bg-white border border-border hover:border-border-hover text-text-muted hover:text-text disabled:opacity-60 transition-colors px-3.5 py-2 rounded-md text-[13px] font-medium flex items-center gap-1.5"
        >
          <FolderUp size={14} strokeWidth={2} />
          폴더 업로드
        </button>
        {!disableNewFolder && (
          <button
            onClick={handleNewFolder}
            className="bg-white border border-border hover:border-border-hover text-text-muted hover:text-text transition-colors px-3.5 py-2 rounded-md text-[13px] font-medium flex items-center gap-1.5"
          >
            <FolderPlus size={14} strokeWidth={2} /> 새 폴더
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error — webkitdirectory 는 비표준 속성
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => handleFolder(e.target.files)}
        />
      </div>
      {dialog}
    </>
  );
}
