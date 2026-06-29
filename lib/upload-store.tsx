"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { startUpload, type ConflictMode, type UploadStats } from "@/lib/upload";

export type UploadStatus =
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type UploadEntry = {
  id: string;
  targetPath: string;
  files: File[];
  fileCount: number;
  sent: number;
  total: number;
  startedAt: number;
  finishedAt: number | null;
  status: UploadStatus;
  error?: string;
  peakBytesPerSec?: number;
  cancel: () => void;
};

type UploadOptions = {
  conflictMode?: ConflictMode;
  /** 완료 시 추가 콜백 (페이지 별 router.refresh 등) */
  onComplete?: (entry: UploadEntry) => void;
};

type UploadContextValue = {
  uploads: UploadEntry[];
  enqueue: (
    targetPath: string,
    files: File[],
    options?: UploadOptions,
  ) => string;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  /** 실패한 업로드를 같은 파일·목적지로 재시도 */
  retry: (id: string) => void;
  /** 자주 쓰이는 합계 — 도크 헤더 표시용 */
  summary: {
    runningCount: number;
    totalCount: number;
    sent: number;
    total: number;
    pct: number;
  };
};

const UploadContext = createContext<UploadContextValue | null>(null);

const AUTO_DISMISS_MS = 30_000; // 완료된 잡은 30초 후 자동 정리

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/** 단일 영상 업로드는 완료 후 공유 패널을 띄우므로 판별 (자동 정리 보류용) */
export function isVideoFile(f: File): boolean {
  if (f.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv|mpg|mpeg)$/i.test(f.name);
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  // 최신 uploads 참조 (retry 등 콜백에서 stale 회피)
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  // 핸들 mutable state — setUploads 의 함수형 업데이트로 안전하게 다룸
  const router = useRouter();
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
    const t = dismissTimers.current.get(id);
    if (t) {
      clearTimeout(t);
      dismissTimers.current.delete(id);
    }
  }, []);

  const cancel = useCallback((id: string) => {
    setUploads((prev) => {
      const u = prev.find((x) => x.id === id);
      if (u && u.status === "running") {
        try {
          u.cancel();
        } catch {}
      }
      return prev;
    });
  }, []);

  const scheduleDismiss = useCallback(
    (id: string) => {
      const existing = dismissTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      dismissTimers.current.set(id, t);
    },
    [dismiss],
  );

  const enqueue = useCallback(
    (
      targetPath: string,
      files: File[],
      options?: UploadOptions,
    ): string => {
      const id = genId();
      const total = files.reduce((s, f) => s + f.size, 0);
      const fileCount = files.length;

      // handle 은 startUpload 가 만든다 — placeholder cancel 먼저 넣고 setUploads 후 갱신
      let cancelFn: () => void = () => {};

      const entry: UploadEntry = {
        id,
        targetPath,
        files,
        fileCount,
        sent: 0,
        total,
        startedAt: Date.now(),
        finishedAt: null,
        status: "running",
        cancel: () => cancelFn(),
      };

      setUploads((prev) => [...prev, entry]);

      const handle = startUpload(
        targetPath,
        files,
        (sent, totalBytes) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, sent, total: totalBytes } : u,
            ),
          );
        },
        (stats: UploadStats) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id
                ? { ...u, peakBytesPerSec: stats.peakBytesPerSec }
                : u,
            ),
          );
        },
        { conflictMode: options?.conflictMode },
      );
      cancelFn = handle.cancel;

      // 완료 처리
      handle.done.then((res) => {
        const nextStatus: UploadStatus = res.ok
          ? "done"
          : res.error === "aborted"
            ? "cancelled"
            : "failed";
        const finishedAt = Date.now();
        // 콜백용 최종 entry — state 외부에서 미리 구성
        // (progress 필드는 완료 시점이라 sent ≒ total 로 가정)
        const finalEntry: UploadEntry = {
          ...entry,
          sent: entry.total,
          status: nextStatus,
          finishedAt,
          error: res.ok ? undefined : res.error,
        };
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id
              ? {
                  ...u,
                  status: nextStatus,
                  finishedAt,
                  error: res.ok ? undefined : res.error,
                }
              : u,
          ),
        );
        // 콜백은 updater 밖에서 — updater 안에서 호출하면
        // 다른 컴포넌트의 setState 가 렌더 중 트리거되어 React 경고 발생
        try {
          options?.onComplete?.(finalEntry);
        } catch {}
        // 단일 영상 성공 업로드는 공유 패널(링크)을 띄우므로 자동 정리 보류 — 사용자가 직접 닫음.
        // 그 외(다중·이미지·실패·취소)는 일정 시간 후 자동 dismiss.
        const isSingleVideo =
          res.ok && files.length === 1 && isVideoFile(files[0]);
        if (!isSingleVideo) scheduleDismiss(id);

        // 성공 시 현재 라우트 리프레시 (사용자가 그 폴더에 있다면 즉시 리스트 갱신)
        if (res.ok) router.refresh();
      });

      return id;
    },
    [router, scheduleDismiss],
  );

  // 실패한 업로드를 같은 파일·목적지로 재시도 (새 항목으로 재인큐 후 실패 항목 제거)
  const retry = useCallback(
    (id: string) => {
      const u = uploadsRef.current.find((x) => x.id === id);
      if (!u || u.status !== "failed") return;
      enqueue(u.targetPath, u.files);
      dismiss(id);
    },
    [enqueue, dismiss],
  );

  // beforeunload 가드 — 진행 중 업로드 있으면 탭 닫기·새로고침 시 경고
  useEffect(() => {
    const hasRunning = uploads.some((u) => u.status === "running");
    if (!hasRunning) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [uploads]);

  // unmount 시 모든 dismiss 타이머 정리
  useEffect(() => {
    return () => {
      for (const t of dismissTimers.current.values()) clearTimeout(t);
      dismissTimers.current.clear();
    };
  }, []);

  const summary = useMemo(() => {
    const running = uploads.filter((u) => u.status === "running");
    const sent = running.reduce((s, u) => s + u.sent, 0);
    const total = running.reduce((s, u) => s + u.total, 0);
    return {
      runningCount: running.length,
      totalCount: uploads.length,
      sent,
      total,
      pct: total > 0 ? Math.min(100, (sent / total) * 100) : 0,
    };
  }, [uploads]);

  const value: UploadContextValue = {
    uploads,
    enqueue,
    cancel,
    dismiss,
    retry,
    summary,
  };

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error("useUpload must be used inside <UploadProvider>");
  }
  return ctx;
}
