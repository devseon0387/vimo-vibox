"use client";

import { Modal } from "./Modal";
import { AlertTriangle, FilePlus2, Replace, MinusCircle } from "lucide-react";
import type { ConflictMode } from "@/lib/upload";

export function ConflictDialog({
  open,
  conflicts,
  onChoose,
  onCancel,
}: {
  open: boolean;
  conflicts: string[]; // 충돌 파일 절대 경로 리스트
  onChoose: (mode: ConflictMode) => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle size={15} strokeWidth={2.2} className="text-amber-500" />
          이미 같은 이름의 파일이 있어요
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="p-5 space-y-4">
        <div className="text-base text-text-muted">
          업로드하려는 폴더 안에{" "}
          <span className="font-semibold text-text">{conflicts.length}개</span>{" "}
          파일이 이미 존재합니다. 어떻게 처리할까요?
        </div>

        <div className="bg-surface border border-border rounded-md max-h-[140px] overflow-y-auto p-2 space-y-0.5">
          {conflicts.slice(0, 20).map((p) => (
            <div
              key={p}
              className="font-mono text-xs text-text-faint truncate"
              title={p}
            >
              {p.split("/").pop()}
            </div>
          ))}
          {conflicts.length > 20 && (
            <div className="text-xs text-text-faint italic pt-1">
              … 외 {conflicts.length - 20}개
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => onChoose("autonumber")}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md border border-border hover:border-accent hover:bg-accent-soft/30 text-left transition-colors"
          >
            <FilePlus2
              size={16}
              strokeWidth={2}
              className="text-text-soft mt-0.5 shrink-0"
            />
            <div>
              <div className="text-base font-semibold text-text">
                자동 번호 매기기
              </div>
              <div className="text-xs text-text-faint">
                새 파일은 <span className="font-mono">name (1).mp4</span> 처럼 번호가
                붙어요. 기존 파일은 그대로
              </div>
            </div>
          </button>
          <button
            onClick={() => onChoose("overwrite")}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md border border-border hover:border-rose-400 hover:bg-rose-50 text-left transition-colors"
          >
            <Replace
              size={16}
              strokeWidth={2}
              className="text-rose-500 mt-0.5 shrink-0"
            />
            <div>
              <div className="text-base font-semibold text-text">덮어쓰기</div>
              <div className="text-xs text-text-faint">
                기존 파일이 새 파일로 교체돼요. 되돌릴 수 없음
              </div>
            </div>
          </button>
          <button
            onClick={() => onChoose("skip")}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md border border-border hover:border-border-hover hover:bg-hover text-left transition-colors"
          >
            <MinusCircle
              size={16}
              strokeWidth={2}
              className="text-text-soft mt-0.5 shrink-0"
            />
            <div>
              <div className="text-base font-semibold text-text">건너뛰기</div>
              <div className="text-xs text-text-faint">
                충돌 파일은 업로드 안 함. 새로운 파일만 올라감
              </div>
            </div>
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-base text-text-muted hover:text-text"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
