"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Folder, ArrowLeft, MoveRight } from "lucide-react";
import { Modal } from "./Modal";
import type { FileEntry } from "@/lib/fs/storage";
import { useToast } from "./Toast";
import { stripDisplayPrefix } from "@/lib/path-display";

export function MoveDialog({
  entry,
  additionalEntries,
  open,
  onClose,
  onMoved,
  displayPrefix,
}: {
  entry: FileEntry | null;
  /** 다중 선택 일괄 이동 시 같이 옮길 추가 항목들 */
  additionalEntries?: FileEntry[];
  open: boolean;
  onClose: () => void;
  onMoved: () => void;
  /**
   * 개인 드라이브 컨텍스트(/personal/{userId}). 지정하면 그 안에서만 탐색하고
   * 브레드크럼/대상표시에서 prefix를 가린다. 미지정(team/rendering)이면 루트("/")부터 탐색.
   */
  displayPrefix?: string;
}) {
  // 탐색 기준 루트 — 개인 드라이브면 personalRoot, 아니면 전체 루트
  const rootPath = displayPrefix || "/";
  const [path, setPath] = useState<string>(rootPath);
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setPath(rootPath);
  }, [open, entry?.path, rootPath]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        const onlyFolders = (body.entries as FileEntry[])
          .filter((e) => e.isFolder)
          // 자기 자신 안으로 이동 불가
          .filter((e) => !entry || e.path !== entry.path);
        setFolders(onlyFolders);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, path, entry?.path]);

  if (!entry) return null;

  // 화면 표시는 prefix 제거한 상대경로 기준
  const relPath = stripDisplayPrefix(path, displayPrefix);
  const segments = relPath === "/" ? [] : relPath.split("/").filter(Boolean);
  // 표시 세그먼트 i까지의 FULL 경로 (탐색/이동에 사용)
  const fullAt = (i: number) => {
    const sub = "/" + segments.slice(0, i + 1).join("/");
    return displayPrefix ? displayPrefix + sub : sub;
  };
  const parentFull = segments.length <= 1 ? rootPath : fullAt(segments.length - 2);

  const currentParent = entry.path.split("/").slice(0, -1).join("/") || "/";
  const targetSame = path === currentParent;

  const allEntries = [entry, ...(additionalEntries ?? [])].filter(
    (e): e is FileEntry => !!e,
  );
  const isMulti = allEntries.length > 1;

  const doMove = async () => {
    setMoving(true);
    try {
      let success = 0;
      let failed = 0;
      for (const it of allEntries) {
        const toPath = (path === "/" ? "" : path) + "/" + it.name;
        if (toPath === it.path) {
          // 같은 위치 — skip
          continue;
        }
        try {
          const res = await fetch("/api/files", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: it.path, to: toPath }),
          });
          if (res.ok) success++;
          else failed++;
        } catch {
          failed++;
        }
      }
      const destLabel = relPath === "/" ? "루트로" : `${relPath}으로`;
      if (failed === 0) {
        toast.success(
          isMulti ? (
            <>
              <span className="font-semibold">{success}개 항목</span> {destLabel}{" "}
              이동됨
            </>
          ) : (
            <>
              <span className="font-semibold">{entry.name}</span> {destLabel} 이동됨
            </>
          ),
        );
      } else {
        toast.error(`${success}개 이동, ${failed}개 실패`);
      }
      onMoved();
      onClose();
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <MoveRight size={15} strokeWidth={2.2} />
          {isMulti
            ? `${allEntries.length}개 항목 이동`
            : `"${entry.name}" 이동`}
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="p-5">
        <div className="text-sm text-text-faint mb-2">대상 폴더</div>
        <div className="flex items-center gap-1 text-base mb-3 flex-wrap">
          <button
            onClick={() => setPath(rootPath)}
            className="hover:text-accent text-text-muted transition-colors"
          >
            {displayPrefix ? "My Box" : "Vibox"}
          </button>
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
                {isLast ? (
                  <span className="text-text font-semibold">{seg}</span>
                ) : (
                  <button
                    onClick={() => setPath(fullAt(i))}
                    className="hover:text-accent text-text-muted transition-colors"
                  >
                    {seg}
                  </button>
                )}
              </span>
            );
          })}
        </div>

        <div className="bg-surface border border-border rounded-md max-h-[260px] overflow-y-auto mb-4">
          {path !== rootPath && (
            <button
              onClick={() => setPath(parentFull)}
              className="w-full flex items-center gap-2 px-4 py-2 text-base text-text-muted hover:bg-white border-b border-border"
            >
              <ArrowLeft size={13} />
              상위 폴더로
            </button>
          )}
          {loading && (
            <div className="p-4 text-sm text-text-faint">불러오는 중...</div>
          )}
          {!loading && folders.length === 0 && (
            <div className="p-6 text-center text-sm text-text-faint">
              여기엔 폴더가 없습니다
              {path === rootPath && " (현재 위치에 이동)"}
            </div>
          )}
          {folders.map((f) => (
            <button
              key={f.path}
              onClick={() => setPath(f.path)}
              className="w-full flex items-center gap-2 px-4 py-2 text-base text-text hover:bg-white border-b border-[#f5f5f5]"
            >
              <Folder size={14} className="text-accent" strokeWidth={2} />
              <span className="flex-1 text-left">{f.name}</span>
              <ChevronRight size={13} className="text-text-faint" />
            </button>
          ))}
        </div>

        <div className="text-sm text-text-soft mb-4">
          이동 대상: <span className="font-mono text-text">{relPath}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-base font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={doMove}
            disabled={moving || targetSame}
            className="flex-1 bg-text text-white hover:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed py-2 rounded-md text-base font-semibold"
          >
            {moving ? "이동 중..." : targetSame ? "현재 폴더" : "여기로 이동"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
