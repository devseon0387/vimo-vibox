"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload as UploadIcon, FolderPlus } from "lucide-react";
import { usePrompt } from "./PromptDialog";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";

const SUGGESTED = ["미팅 자료", "촬영 원본", "참고"];

/**
 * 빈 폴더용 EmptyState (mockup C).
 * - 큰 dropzone
 * - 폴더 추천 chip ("+ 미팅 자료" 등) → 클릭 즉시 생성
 * - "+ 새 폴더" chip → 이름 입력 prompt
 *
 * dropzone은 시각적 강조만 — 실제 drag/drop은 상위 FilesPane이 처리.
 */
export function EmptyState({
  currentPath,
  isRoot,
  onUploadClick,
}: {
  currentPath: string;
  isRoot: boolean;
  /** dropzone 클릭 시 파일 picker 열기 (FilesPane이 제공) */
  onUploadClick?: () => void;
}) {
  const router = useRouter();
  const { promptInput, dialog } = usePrompt();
  const toast = useToast();
  const [creating, setCreating] = useState<string | null>(null);

  const createFolder = async (name: string) => {
    setCreating(name);
    try {
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
    } finally {
      setCreating(null);
    }
  };

  const onCustomFolder = async () => {
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
    await createFolder(name);
  };

  const dropzoneClickable = !!onUploadClick;
  return (
    <div className="w-full text-center py-2">
      {/* Drop zone */}
      <div
        role={dropzoneClickable ? "button" : undefined}
        tabIndex={dropzoneClickable ? 0 : undefined}
        onClick={onUploadClick}
        onKeyDown={
          dropzoneClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onUploadClick?.();
                }
              }
            : undefined
        }
        className={`border-2 border-dashed border-accent/40 bg-accent-soft/40 transition-colors rounded-xl py-12 px-6 ${
          dropzoneClickable
            ? "cursor-pointer hover:bg-accent-soft hover:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30"
            : ""
        }`}
      >
        <div className="mx-auto w-12 h-12 rounded-full bg-white text-accent grid place-items-center mb-3 shadow-sm">
          <UploadIcon size={22} strokeWidth={2} />
        </div>
        <div className="text-[14px] font-semibold text-text mb-1">
          {isRoot ? "아직 파일이 없어요" : "이 폴더가 비어있어요"}
        </div>
        <div className="text-[12.5px] text-text-soft">
          {dropzoneClickable
            ? "끌어다 놓거나 클릭해서 업로드"
            : "파일을 여기로 끌어다 놓거나 위쪽 업로드 버튼"}
        </div>
      </div>

      {/* 폴더 추천 chip */}
      <div className="mt-5 text-[11.5px] text-text-faint flex flex-wrap items-center justify-center gap-2">
        <span>또는 폴더부터 만들기:</span>
        {SUGGESTED.map((name) => (
          <button
            key={name}
            type="button"
            disabled={creating !== null}
            onClick={() => createFolder(name)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border text-text-soft text-[11.5px] hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
          >
            <FolderPlus size={11} strokeWidth={2.2} />
            {creating === name ? "생성중…" : name}
          </button>
        ))}
        <button
          type="button"
          disabled={creating !== null}
          onClick={onCustomFolder}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-dashed border-border text-text-faint text-[11.5px] hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
        >
          + 새 폴더
        </button>
      </div>
      {dialog}
    </div>
  );
}
