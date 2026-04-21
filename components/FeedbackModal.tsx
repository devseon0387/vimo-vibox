"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import {
  CategoryIcon,
  CategoryIconBox,
} from "./CategoryIcon";
import {
  CATEGORIES,
  detectCategory,
  detectKind,
  getCategoryMeta,
  PRAISE_BG,
  PRAISE_COLOR,
  type Category,
  type Kind,
} from "@/lib/comments/detect";
import type { FileEntry } from "@/lib/fs/storage";
import {
  parseAnnotation,
  type Annotation,
} from "@/lib/comments/annotation";
import {
  Check,
  CornerDownRight,
  SendHorizontal,
  Trash2,
  Clock,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Heart,
  PencilLine,
  Type,
  Sparkles,
  Loader2,
  SkipBack,
  SkipForward,
  MoreHorizontal,
  ArrowUpNarrowWide,
  ArrowDownNarrowWide,
  X,
} from "lucide-react";

type CommentRow = {
  id: string;
  filePath: string;
  authorId: string;
  authorName: string;
  videoTimeMs: number;
  category: Category;
  autoCategory: Category;
  kind: Kind;
  autoKind: Kind;
  annotation: Annotation | null;
  body: string;
  parentId: string | null;
  resolvedAt: number | null;
  resolvedBy: string | null;
  createdAt: number;
};

type PendingAnno = {
  bbox: { x: number; y: number; w: number; h: number }; // 비율 0~1
  original: string;
  suggestion: string;
  note: string;
  kind: Kind;
  ocrLoading?: boolean;
};

async function runOcr(
  video: HTMLVideoElement | null,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<string> {
  if (!video) return "";
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return "";

    // 약간의 여백 추가 (자막 잘림 방지)
    const padX = 0.01;
    const padY = 0.015;
    const sx = Math.max(0, (bbox.x - padX) * vw);
    const sy = Math.max(0, (bbox.y - padY) * vh);
    const sw = Math.min(vw - sx, (bbox.w + padX * 2) * vw);
    const sh = Math.min(vh - sy, (bbox.h + padY * 2) * vh);

    const canvas = document.createElement("canvas");
    // OCR 정확도를 위해 최소 크기 보장
    const minW = 320;
    const scale = sw < minW ? minW / sw : 1;
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.text === "string" ? data.text.trim() : "";
  } catch {
    return "";
  }
}

type ViewFilter = "all" | "feedback" | "praise";

function formatTc(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  const d = Math.floor(diff / 86400_000);
  if (d < 7) return `${d}일 전`;
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function FeedbackModal({
  entry,
  backHref = "/",
  currentUserId,
  isAdmin,
}: {
  entry: FileEntry | null;
  backHref?: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const open = !!entry;
  const vidRef = useRef<HTMLVideoElement>(null);
  const [items, setItems] = useState<CommentRow[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pendingAnno, setPendingAnno] = useState<PendingAnno | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: string; top: string } | null>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { success, error: toastError } = useToast();

  const filePath = entry?.path ?? null;

  const fetchComments = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comments?path=${encodeURIComponent(filePath)}`,
      );
      const data = await res.json();
      if (res.ok) {
        const parsed: CommentRow[] = (data.comments ?? []).map((c: CommentRow & { annotation: string | Annotation | null }) => ({
          ...c,
          annotation:
            typeof c.annotation === "string"
              ? parseAnnotation(c.annotation)
              : (c.annotation ?? null),
        }));
        setItems(parsed);
      }
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    if (open && filePath) fetchComments();
    if (!open) {
      setItems([]);
      setSelectedId(null);
      setCurrentTime(0);
    }
  }, [open, filePath, fetchComments]);

  // 키보드 단축키: Space(재생), ←/→(±3s), Shift+←/→(±10s), J/L(-/+10s)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.matches("textarea, input, [contenteditable]")) return;
      const v = vidRef.current;
      if (!v) return;

      if (e.key === " ") {
        e.preventDefault();
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 3;
        v.currentTime = Math.max(0, v.currentTime - delta);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 3;
        v.currentTime = Math.min(v.duration || Infinity, v.currentTime + delta);
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 10);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      } else if (e.key === "<" || e.key === ",") {
        // 재생 속도 내림: 0.5 ↓ 0.75 ↓ 1 ↓ 1.25 ↓ 1.5 ↓ 2
        e.preventDefault();
        const steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const idx = steps.indexOf(v.playbackRate);
        const next = steps[Math.max(0, (idx === -1 ? 2 : idx) - 1)];
        v.playbackRate = next;
        setPlaybackRate(next);
      } else if (e.key === ">" || e.key === ".") {
        e.preventDefault();
        const steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const idx = steps.indexOf(v.playbackRate);
        const next = steps[Math.min(steps.length - 1, (idx === -1 ? 2 : idx) + 1)];
        v.playbackRate = next;
        setPlaybackRate(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // 댓글·마커 클릭 시 자동 재생 여부 (localStorage에 보관)
  // SSR-safe: 초기값 고정, mount 후에만 localStorage 읽음
  const [autoPlayOnSeek, setAutoPlayOnSeek] = useState<boolean>(true);
  const autoPlayHydrated = useRef(false);
  useEffect(() => {
    const v = window.localStorage.getItem("vibox.autoPlayOnSeek");
    if (v !== null) setAutoPlayOnSeek(v === "1");
    autoPlayHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!autoPlayHydrated.current) return;
    window.localStorage.setItem(
      "vibox.autoPlayOnSeek",
      autoPlayOnSeek ? "1" : "0",
    );
  }, [autoPlayOnSeek]);

  const seek = useCallback(
    (ms: number, annotation?: Annotation | null) => {
      const v = vidRef.current;
      if (!v) return;
      let targetMs = ms;
      // 정지 모드 + annotation 있으면: 박스가 보이는 프레임(REVEAL_DELAY 지난 시점)에 정지
      // 자동재생 모드: 그대로 seek (재생이 진행되면 자연스럽게 delay 경과하며 박스 등장)
      if (!autoPlayOnSeek && annotation && typeof annotation.startMs === "number") {
        targetMs = annotation.startMs + 400; // 300ms delay + 100ms buffer
      }
      v.currentTime = targetMs / 1000;
      if (autoPlayOnSeek) v.play().catch(() => {});
      else v.pause();
    },
    [autoPlayOnSeek],
  );

  const togglePlay = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      v.requestFullscreen().catch(() => {});
    }
  }, []);

  // 재생 속도
  const [playbackRate, setPlaybackRate] = useState(1);
  const changePlaybackRate = useCallback((rate: number) => {
    const v = vidRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const topLevelItems = useMemo(
    () => items.filter((c) => !c.parentId),
    [items],
  );

  const repliesByParent = useMemo(() => {
    const map: Record<string, CommentRow[]> = {};
    for (const c of items) {
      if (c.parentId) {
        (map[c.parentId] ??= []).push(c);
      }
    }
    for (const k in map) map[k].sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [items]);

  // 정렬: 기본 ascending (영상 시간순), desc면 역순
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("vibox.sortDesc");
    if (v !== null) setSortDesc(v === "1");
  }, []);
  const toggleSort = () => {
    setSortDesc((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("vibox.sortDesc", next ? "1" : "0");
      }
      return next;
    });
  };

  const visibleItems = useMemo(() => {
    let arr = topLevelItems;
    if (viewFilter !== "all") {
      arr = arr.filter((c) => c.kind === viewFilter);
    }
    // 수정 탭: 체크 완료 항목 제외 (전체 탭에선 보임)
    if (viewFilter === "feedback") {
      arr = arr.filter((c) => !c.resolvedAt);
    }
    if (sortDesc) {
      arr = [...arr].sort((a, b) => b.videoTimeMs - a.videoTimeMs);
    }
    return arr;
  }, [topLevelItems, viewFilter, sortDesc]);

  // 이전/다음 피드백 단축키 ([/])
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      const t = e.target as HTMLElement | null;
      if (t && t.matches("textarea, input, [contenteditable]")) return;
      if (visibleItems.length === 0) return;
      e.preventDefault();
      const v = vidRef.current;
      if (!v) return;
      const sorted = [...visibleItems].sort(
        (a, b) => a.videoTimeMs - b.videoTimeMs,
      );
      const nowMs = v.currentTime * 1000;
      let target: CommentRow | undefined;
      if (e.key === "[") {
        target = [...sorted].reverse().find((c) => c.videoTimeMs < nowMs - 100);
        if (!target) target = sorted[sorted.length - 1];
      } else {
        target = sorted.find((c) => c.videoTimeMs > nowMs + 100);
        if (!target) target = sorted[0];
      }
      if (target) {
        seek(target.videoTimeMs, target.annotation);
        setSelectedId(target.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, visibleItems, seek]);

  // 비디오 위에 떠 있을 annotation 목록
  // - 우선 annotation에 저장된 startMs/endMs (AI 검수 scan에서 계산) 사용
  // - 없으면 videoTimeMs 기준 비대칭 윈도우로 폴백
  // - bbox 겹침 시 가장 가까운 것만 표시 (여러 annotation 쌓이지 않도록)
  const activeAnnotations = useMemo(() => {
    if (duration === 0) return [] as CommentRow[];

    // 자막이 먼저 등장하고 0.3초 뒤에 수정/박스 표시 (시청자가 먼저 자막을 읽을 시간 확보)
    const REVEAL_DELAY_MS = 300;

    const candidates = topLevelItems
      .filter((c) => c.annotation)
      .map((c) => {
        const ann = c.annotation!;
        const hasRange =
          typeof ann.startMs === "number" && typeof ann.endMs === "number";
        let visibleStart: number;
        let visibleEnd: number;
        if (hasRange) {
          const spanMs = ann.endMs! - ann.startMs!;
          const MIN_SPAN = 1000; // 최소 1초 표시 보장
          const extraPad = Math.max(0, (MIN_SPAN - spanMs) / 2);
          visibleStart = ann.startMs! + REVEAL_DELAY_MS - extraPad;
          visibleEnd = ann.endMs! + REVEAL_DELAY_MS + 80 + extraPad;
        } else {
          visibleStart = c.videoTimeMs + REVEAL_DELAY_MS - 300;
          visibleEnd = c.videoTimeMs + REVEAL_DELAY_MS + 2500;
        }
        const centerTime = hasRange
          ? (ann.startMs! + ann.endMs!) / 2 + REVEAL_DELAY_MS
          : c.videoTimeMs + REVEAL_DELAY_MS;
        return { c, visibleStart, visibleEnd, diff: currentTime - centerTime };
      })
      .filter(
        ({ visibleStart, visibleEnd }) =>
          currentTime >= visibleStart && currentTime <= visibleEnd,
      )
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));

    const bboxOverlaps = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) =>
      !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

    const shown: CommentRow[] = [];
    for (const { c } of candidates) {
      const ab = c.annotation?.bbox;
      if (!ab) continue;
      const overlapsShown = shown.some(
        (s) => s.annotation && bboxOverlaps(ab, s.annotation.bbox),
      );
      if (!overlapsShown) shown.push(c);
    }
    return shown;
  }, [topLevelItems, currentTime, duration]);

  const feedbackCount = topLevelItems.filter(
    (c) => c.kind === "feedback" && !c.resolvedAt,
  ).length;
  const praiseCount = topLevelItems.filter((c) => c.kind === "praise").length;

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      txt: 0,
      cut: 0,
      col: 0,
      aud: 0,
      mtn: 0,
      etc: 0,
    };
    for (const c of items) {
      if (!c.resolvedAt) counts[c.category]++;
    }
    return counts;
  }, [items]);

  const handleResolve = async (id: string, resolved: boolean) => {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) {
      await fetchComments();
    } else {
      toastError("상태 변경 실패");
    }
  };

  const handleChangeCategory = async (id: string, category: Category) => {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (res.ok) {
      await fetchComments();
    } else {
      toastError("분류 변경 실패");
    }
  };

  const handleChangeKind = async (id: string, kind: Kind) => {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (res.ok) {
      await fetchComments();
    } else {
      toastError("종류 변경 실패");
    }
  };

  const handleDelete = async (id: string, authorName: string) => {
    const ok = await confirm({
      title: "댓글 삭제",
      message: (
        <>
          <span className="font-semibold text-text">{authorName}</span>님의 댓글을
          삭제할까요?
          <br />
          답글이 있으면 함께 삭제됩니다.
        </>
      ),
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) {
      success("댓글 삭제됨");
      await fetchComments();
    } else {
      const body = await res.json().catch(() => ({}));
      toastError("삭제 실패: " + (body.error ?? res.statusText));
    }
  };

  // 검수 Job 상태
  const [scanJob, setScanJob] = useState<{
    id: string;
    status: string;
    stage: string;
    progress: number;
    issuesFound: number | null;
  } | null>(null);

  // 진행률 폴링
  useEffect(() => {
    if (!scanJob || scanJob.status === "done" || scanJob.status === "failed" || scanJob.status === "cancelled") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/videos/scan?jobId=${encodeURIComponent(scanJob.id)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setScanJob({
          id: data.id,
          status: data.status,
          stage: data.stage,
          progress: data.progress,
          issuesFound: data.issuesFound,
        });
        if (data.status === "done") {
          clearInterval(timer);
          if ((data.issuesFound ?? 0) > 0) {
            success(`AI 검수 완료 · 피드백 ${data.issuesFound}건 발견`);
          } else {
            success("AI 검수 완료 · 오타 없음");
          }
          await fetchComments();
          // 완료 후 2초 뒤에 카드 자동 숨김
          setTimeout(() => setScanJob(null), 2000);
        } else if (data.status === "failed") {
          clearInterval(timer);
          toastError("검수 실패: " + (data.error ?? "알 수 없음"));
          setTimeout(() => setScanJob(null), 3000);
        } else if (data.status === "cancelled") {
          clearInterval(timer);
          setScanJob(null);
        }
      } catch {
        // 다음 폴링에서 재시도
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [scanJob, fetchComments, success, toastError]);

  const handleScan = async () => {
    if (!entry || scanJob) return;
    const ok = await confirm({
      title: "AI 자동 검수",
      message: (
        <>
          자막 오타와 블랙·정지 프레임을 자동으로 검사합니다.
          <br />
          <span className="text-text-faint text-[11.5px]">
            약 2~3분 소요 · 기존 AI 피드백은 새 결과로 교체됩니다
          </span>
        </>
      ),
      confirmLabel: "검수 시작",
    });
    if (!ok) return;
    try {
      const res = await fetch("/api/videos/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("검수 실패: " + (data.error ?? res.statusText));
        return;
      }
      setScanJob({
        id: data.jobId,
        status: "pending",
        stage: "대기 중",
        progress: 0,
        issuesFound: null,
      });
    } catch (e) {
      toastError("검수 실패: " + (e instanceof Error ? e.message : "unknown"));
    }
  };

  const handleCancelScan = async () => {
    if (!scanJob) return;
    try {
      await fetch(`/api/videos/scan?jobId=${encodeURIComponent(scanJob.id)}`, {
        method: "DELETE",
      });
      setScanJob(null);
    } catch {}
  };

  // AI 검수 히스토리 (최근 1건)
  const [lastScan, setLastScan] = useState<{
    finishedAt: number;
    issuesFound: number | null;
    startedByName: string;
  } | null>(null);

  const fetchLastScan = useCallback(async () => {
    if (!filePath) return;
    try {
      const res = await fetch(
        `/api/videos/scan/history?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const lastDone = (data.history ?? []).find(
        (h: { status: string }) => h.status === "done",
      );
      if (lastDone) {
        setLastScan({
          finishedAt: lastDone.finishedAt,
          issuesFound: lastDone.issuesFound,
          startedByName: lastDone.startedByName,
        });
      } else {
        setLastScan(null);
      }
    } catch {}
  }, [filePath]);

  useEffect(() => {
    if (open && filePath) fetchLastScan();
  }, [open, filePath, fetchLastScan]);

  // 검수 완료 후 히스토리 갱신
  useEffect(() => {
    if (scanJob?.status === "done") fetchLastScan();
  }, [scanJob, fetchLastScan]);

  if (!entry) return null;
  const src = `/api/download?path=${encodeURIComponent(entry.path)}&inline=1`;
  const poster = `/api/thumb?path=${encodeURIComponent(entry.path)}`;

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-0px)] bg-slate-100">
        {/* 상단 바: 뒤로가기 + 파일명 */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={2} />
            파일 목록
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <h1 className="text-[14px] font-semibold text-slate-900 truncate">
            {entry.name}
          </h1>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* 좌: 비디오 + 타임라인 (모바일에선 상단 고정, 나머지 공간은 댓글) */}
          <div className="shrink-0 md:shrink md:flex-1 min-w-0 flex flex-col bg-slate-100">
            <div className="flex-1 md:flex-[5] min-h-0 flex items-center md:items-end justify-center bg-slate-100 overflow-hidden">
              <div
                ref={videoWrapRef}
                className={`relative overflow-hidden bg-black max-w-full max-h-full ${
                  annotationMode ? "cursor-crosshair" : "cursor-pointer"
                }`}
                style={{ aspectRatio: "16 / 9", width: "100%" }}
                onClick={(e) => {
                  // 주석 모드 아니면 재생/일시정지
                  if (!annotationMode && e.target === e.currentTarget) {
                    togglePlay();
                  }
                }}
              >
              <video
                ref={vidRef}
                src={src}
                poster={poster}
                preload="metadata"
                className="w-full h-full object-contain pointer-events-none"
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration * 1000);
                  setMuted(e.currentTarget.muted);
                }}
                onTimeUpdate={(e) =>
                  setCurrentTime(e.currentTarget.currentTime * 1000)
                }
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />

              {/* 주석 모드 토글 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAnnotationMode((v) => !v);
                  if (!annotationMode && vidRef.current) vidRef.current.pause();
                }}
                className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold border backdrop-blur transition-colors z-20 ${
                  annotationMode
                    ? "bg-amber-400 text-black border-amber-400"
                    : "bg-black/55 text-white border-white/15 hover:bg-black/70"
                }`}
              >
                <Type size={11} strokeWidth={2.3} />
                {annotationMode ? "자막 수정 모드" : "자막 수정"}
              </button>

              {/* 기존 주석 렌더: 자막 등장 시각 즈음에만 + bbox 겹침 방지 */}
              {activeAnnotations.map((c) => {
                if (!c.annotation) return null;
                const isPraise = c.kind === "praise";
                const isResolved = !!c.resolvedAt;
                const color = isPraise ? PRAISE_COLOR : "#eab308";
                return (
                  <AnnotationOverlay
                    key={c.id}
                    bbox={c.annotation.bbox}
                    original={c.annotation.original}
                    suggestion={c.annotation.suggestion}
                    color={color}
                    resolved={isResolved}
                    isPraise={isPraise}
                    onClick={() => setSelectedId(c.id)}
                  />
                );
              })}

              {/* 드래그 + 팝오버 */}
              {annotationMode && (
                <AnnotationDragLayer
                  onComplete={(bbox, popoverPos) => {
                    setPendingAnno({
                      bbox,
                      original: "",
                      suggestion: "",
                      note: "",
                      kind: "feedback",
                      ocrLoading: true,
                    });
                    setPopoverPos(popoverPos);
                    if (vidRef.current) vidRef.current.pause();

                    // OCR 요청: 영상 프레임의 bbox 영역을 crop해서 서버로
                    runOcr(vidRef.current, bbox).then((text) => {
                      setPendingAnno((cur) =>
                        cur
                          ? {
                              ...cur,
                              original: text || cur.original,
                              ocrLoading: false,
                            }
                          : cur,
                      );
                    });
                  }}
                />
              )}
              {pendingAnno && popoverPos && (
                <AnnotationPopover
                  anno={pendingAnno}
                  pos={popoverPos}
                  onChange={setPendingAnno}
                  onCancel={() => {
                    setPendingAnno(null);
                    setPopoverPos(null);
                  }}
                  onSubmit={async () => {
                    if (!pendingAnno.original.trim() || !pendingAnno.suggestion.trim()) return;
                    const body =
                      pendingAnno.kind === "praise"
                        ? pendingAnno.suggestion.trim() || pendingAnno.original
                        : `${pendingAnno.original} → ${pendingAnno.suggestion}`;
                    const res = await fetch("/api/comments", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        path: entry.path,
                        videoTimeMs: Math.floor(currentTime),
                        body,
                        category: "txt",
                        kind: pendingAnno.kind,
                        annotation: {
                          bbox: pendingAnno.bbox,
                          original: pendingAnno.original,
                          suggestion: pendingAnno.suggestion,
                          note: pendingAnno.note || undefined,
                        },
                      }),
                    });
                    if (res.ok) {
                      setPendingAnno(null);
                      setPopoverPos(null);
                      setAnnotationMode(false);
                      await fetchComments();
                    } else {
                      toastError("주석 등록 실패");
                    }
                  }}
                />
              )}

              {!playing && !annotationMode && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur grid place-items-center text-white">
                    <Play size={26} strokeWidth={2.2} fill="currentColor" />
                  </div>
                </div>
              )}
              </div>
            </div>
            <div className="shrink-0 px-4 pt-3">
              <TimelineStrip
                items={topLevelItems}
                duration={duration}
                currentTime={currentTime}
                playing={playing}
                muted={muted}
                playbackRate={playbackRate}
                filePath={entry.path}
                onSeek={seek}
                onTogglePlay={togglePlay}
                onToggleMute={toggleMute}
                onToggleFullscreen={toggleFullscreen}
                onChangePlaybackRate={changePlaybackRate}
                onSelect={(id) => {
                  const c = items.find((x) => x.id === id);
                  if (c) {
                    seek(c.videoTimeMs, c.annotation);
                    setSelectedId(id);
                  }
                }}
              />
            </div>
            {/* 하단 여백 (데스크톱에서 영상+플레이바를 위로 올림) */}
            <div className="hidden md:block md:flex-[2] md:min-h-0" />
          </div>

          {/* 우: 댓글 패널 (B안 카드 스타일) */}
          <div className="flex-1 md:flex-none w-full md:w-[380px] border-t md:border-t-0 md:border-l border-slate-200 flex flex-col bg-slate-50 min-h-0">
            <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-200">
              <div className="flex items-center gap-2 mb-2.5">
                <h3 className="text-[14px] font-semibold tracking-tight">댓글</h3>
                <span className="text-[12.5px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {items.length}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {entry.kind === "video" && !scanJob && (
                    <button
                      onClick={handleScan}
                      title={
                        lastScan
                          ? `마지막 검수: ${formatRelative(lastScan.finishedAt)} · ${lastScan.issuesFound ?? 0}건 · ${lastScan.startedByName}`
                          : "자막 오타 + 블랙/정지 프레임을 자동 검수합니다"
                      }
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors text-violet-600 hover:bg-violet-50"
                    >
                      <Sparkles size={11} strokeWidth={2.3} />
                      {lastScan ? "재검수" : "AI 검수"}
                      {lastScan && (
                        <span className="text-[10px] text-violet-400 font-normal">
                          · {formatRelative(lastScan.finishedAt)}
                        </span>
                      )}
                    </button>
                  )}
                  <label
                    title="댓글 클릭 시 해당 시점으로 이동 후 자동으로 재생할지, 일시정지 상태로 둘지"
                    className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none px-1 py-1 rounded hover:bg-hover transition-colors"
                  >
                    <span className="text-text-soft">클릭 시 재생</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoPlayOnSeek}
                      onClick={() => setAutoPlayOnSeek((v) => !v)}
                      className={`relative inline-flex h-[14px] w-[24px] items-center rounded-full transition-colors ${
                        autoPlayOnSeek ? "bg-emerald-500" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-[10px] w-[10px] rounded-full bg-white shadow transition-transform ${
                          autoPlayOnSeek ? "translate-x-[12px]" : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex-1 flex items-center gap-1 bg-surface p-0.5 rounded-md">
                  <FilterTab
                    active={viewFilter === "all"}
                    onClick={() => setViewFilter("all")}
                    label="전체"
                  />
                  <FilterTab
                    active={viewFilter === "feedback"}
                    onClick={() => setViewFilter("feedback")}
                    label="수정"
                    count={feedbackCount}
                    color="#111"
                    icon={<PencilLine size={11} strokeWidth={2.2} />}
                  />
                  <FilterTab
                    active={viewFilter === "praise"}
                    onClick={() => setViewFilter("praise")}
                    label="좋아요"
                    count={praiseCount}
                    color={PRAISE_COLOR}
                    icon={<Heart size={11} strokeWidth={2.2} />}
                  />
                </div>
                <button
                  onClick={toggleSort}
                  title={sortDesc ? "최신 순 (나중 시점 먼저)" : "영상 순 (이른 시점 먼저)"}
                  className={`shrink-0 w-7 h-7 rounded grid place-items-center transition-colors ${
                    sortDesc
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {sortDesc ? (
                    <ArrowDownNarrowWide size={13} strokeWidth={2.2} />
                  ) : (
                    <ArrowUpNarrowWide size={13} strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* AI 검수 진행 카드 */}
              {scanJob && (
                <div className="p-3">
                  <div className="bg-gradient-to-br from-violet-500 to-blue-500 rounded-lg p-3 text-white shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={12} strokeWidth={2.4} />
                      <span className="text-[12px] font-bold">AI 검수 중</span>
                      <span className="ml-auto text-[11px] font-mono tabular-nums opacity-90">
                        {scanJob.progress}%
                      </span>
                    </div>
                    <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-500"
                        style={{ width: `${scanJob.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] opacity-90">
                        {scanJob.stage}
                      </span>
                      {(scanJob.status === "running" ||
                        scanJob.status === "pending") && (
                        <button
                          onClick={handleCancelScan}
                          className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
                        >
                          취소
                        </button>
                      )}
                      {scanJob.status === "done" && (
                        <span className="text-[10.5px] font-semibold">
                          ✓ {scanJob.issuesFound ?? 0}건
                        </span>
                      )}
                      {scanJob.status === "failed" && (
                        <span className="text-[10.5px] font-semibold">
                          ✗ 실패
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {loading && items.length === 0 ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-white rounded-lg border border-slate-200 p-3 animate-pulse"
                    >
                      <div className="flex gap-2.5">
                        <div className="shrink-0 w-5 h-5 rounded-full bg-slate-200 mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-10 bg-slate-200 rounded" />
                            <div className="h-4 w-8 bg-slate-100 rounded" />
                          </div>
                          <div className="h-3 bg-slate-100 rounded w-full" />
                          <div className="h-3 bg-slate-100 rounded w-2/3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="p-10 text-center">
                  {viewFilter === "feedback" ? (() => {
                    const totalFeedback = topLevelItems.filter(
                      (c) => c.kind === "feedback",
                    ).length;
                    const hasResolvedFeedback = totalFeedback > 0;
                    return hasResolvedFeedback ? (
                      <>
                        <div className="w-12 h-12 rounded-full bg-emerald-50 grid place-items-center mx-auto mb-3">
                          <Check
                            size={22}
                            className="text-emerald-500"
                            strokeWidth={2.4}
                          />
                        </div>
                        <div className="text-[13px] font-semibold text-slate-700">
                          모든 수정 사항 확인 완료!
                        </div>
                        <div className="text-[11.5px] text-slate-400 mt-1">
                          전체 탭에서 지난 내역을 볼 수 있어요
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-slate-100 grid place-items-center mx-auto mb-3">
                          <PencilLine
                            size={22}
                            className="text-slate-400"
                            strokeWidth={2}
                          />
                        </div>
                        <div className="text-[13px] font-semibold text-slate-700">
                          수정 요청이 없어요
                        </div>
                        <div className="text-[11.5px] text-slate-400 mt-1">
                          아직 피드백이 없습니다
                        </div>
                      </>
                    );
                  })() : viewFilter === "praise" ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-pink-50 grid place-items-center mx-auto mb-3">
                        <Heart
                          size={22}
                          className="text-pink-500"
                          strokeWidth={2.2}
                        />
                      </div>
                      <div className="text-[13px] font-semibold text-slate-700">
                        아직 좋아요가 없어요
                      </div>
                      <div className="text-[11.5px] text-slate-400 mt-1">
                        인상적인 부분에 좋아요를 남겨보세요
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-slate-100 grid place-items-center mx-auto mb-3">
                        <PencilLine
                          size={22}
                          className="text-slate-400"
                          strokeWidth={2}
                        />
                      </div>
                      <div className="text-[13px] font-semibold text-slate-700">
                        첫 번째 댓글을 남겨보세요
                      </div>
                      <div className="text-[11.5px] text-slate-400 mt-1">
                        재생 중 아래 입력창에 자유롭게 작성
                      </div>
                      {entry.kind === "video" && (
                        <button
                          onClick={handleScan}
                          className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          <Sparkles size={12} strokeWidth={2.3} />
                          AI 자동 검수 시작
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {visibleItems.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      replies={repliesByParent[c.id] ?? []}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      filePath={entry.path}
                      selected={selectedId === c.id}
                      canEdit={c.authorId === currentUserId || isAdmin}
                      onSelect={() => {
                        seek(c.videoTimeMs, c.annotation);
                        setSelectedId(c.id);
                      }}
                      onResolve={() =>
                        handleResolve(c.id, !c.resolvedAt)
                      }
                      onChangeCategory={(cat) =>
                        handleChangeCategory(c.id, cat)
                      }
                      onChangeKind={(k) => handleChangeKind(c.id, k)}
                      onDelete={() => handleDelete(c.id, c.authorName)}
                      onReplied={fetchComments}
                      onDeleteReply={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>

            <ComposeBar
              currentTime={currentTime}
              filePath={entry.path}
              onPosted={fetchComments}
            />
          </div>
        </div>
      </div>

      {confirmDialog}
    </>
  );
}

function Marker({
  category,
  kind,
  resolved,
}: {
  category: Category;
  kind: Kind;
  resolved: boolean;
}) {
  const meta = getCategoryMeta(category);
  const color = kind === "praise" ? PRAISE_COLOR : meta.color;
  if (kind === "praise") {
    // 좋아요: 채워진 하트
    return (
      <Heart
        size={14}
        strokeWidth={1.5}
        fill={resolved ? "transparent" : color}
        color={color}
        style={{ filter: `drop-shadow(0 0 0 2px #0f0f0f)` }}
      />
    );
  }
  // 수정: 원
  return (
    <span
      className="block w-[10px] h-[10px] rounded-full border-2 border-[#0f0f0f]"
      style={{
        background: resolved ? "transparent" : color,
        boxShadow: `0 0 0 1.5px ${color}`,
      }}
    />
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
  color,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium transition-colors ${
        active ? "bg-white shadow-sm font-semibold" : "text-text-faint hover:text-text"
      }`}
      style={active && color ? { color } : undefined}
    >
      {icon}
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="text-[10.5px] opacity-70">{count}</span>
      )}
    </button>
  );
}

function TimelineStrip({
  items,
  duration,
  currentTime,
  playing,
  muted,
  playbackRate,
  filePath,
  onSeek,
  onTogglePlay,
  onToggleMute,
  onToggleFullscreen,
  onChangePlaybackRate,
  onSelect,
}: {
  items: CommentRow[];
  duration: number;
  currentTime: number;
  playing: boolean;
  muted: boolean;
  playbackRate: number;
  filePath: string;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onSelect: (id: string) => void;
}) {
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const barRef = useRef<HTMLDivElement>(null);

  // 타임라인 호버 썸네일
  const [hoverState, setHoverState] = useState<{
    x: number;
    timeMs: number;
    barWidth: number;
  } | null>(null);

  const onBarClick = (e: React.MouseEvent) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    onSeek(pct * duration);
  };

  const onBarMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setHoverState({
      x: pct * rect.width,
      timeMs: pct * duration,
      barWidth: rect.width,
    });
  };

  const onBarMouseLeave = () => {
    setHoverState(null);
  };

  // 모달 열릴 때 썸네일 배치 preload (호버 시 즉시 표시)
  useEffect(() => {
    if (!filePath) return;
    // duration이 유효하지 않거나 비정상이면 skip (Infinity/NaN 방지)
    if (!Number.isFinite(duration) || duration <= 0) return;
    const totalSec = Math.floor(duration / 1000);
    if (!Number.isFinite(totalSec) || totalSec <= 0) return;
    // 10초 간격으로 미리 생성 요청 (브라우저가 백그라운드에 캐싱)
    const interval = Math.max(5, Math.floor(totalSec / 60));
    // 안전: 최대 200개 요청으로 제한 (초장시간 영상 대비)
    const MAX_REQUESTS = 200;
    let count = 0;
    for (let t = 0; t <= totalSec && count < MAX_REQUESTS; t += interval) {
      const img = new Image();
      img.src = `/api/thumb?path=${encodeURIComponent(filePath)}&t=${t}`;
      count++;
    }
  }, [filePath, duration]);

  const jump = (deltaSec: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + deltaSec * 1000));
    onSeek(next);
  };

  // 이전/다음 피드백으로 이동 (현재 시간 기준 인접 댓글 탐색)
  const gotoFeedback = (direction: "prev" | "next") => {
    const sorted = [...items].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
    let target: CommentRow | undefined;
    if (direction === "prev") {
      target = [...sorted].reverse().find((c) => c.videoTimeMs < currentTime - 100);
      if (!target) target = sorted[sorted.length - 1]; // wrap
    } else {
      target = sorted.find((c) => c.videoTimeMs > currentTime + 100);
      if (!target) target = sorted[0]; // wrap
    }
    if (target) onSelect(target.id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      {/* Row 1: 진행바 (위) */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="shrink-0 text-[11px] font-mono font-semibold text-slate-900 tabular-nums min-w-[52px]">
          {formatTc(currentTime)}
        </span>
        <div
          ref={barRef}
          onClick={onBarClick}
          onMouseMove={onBarMouseMove}
          onMouseLeave={onBarMouseLeave}
          className="relative h-5 cursor-pointer flex-1"
        >
          {/* 호버 썸네일 프리뷰 — 양 끝에서 overflow 안 되도록 clamp */}
          {hoverState && duration > 0 && filePath && hoverState.barWidth > 0 && (() => {
            const THUMB_W = 180;
            const HALF = THUMB_W / 2;
            // 바가 썸네일보다 좁으면 바 중앙에 배치
            const clampedCenterX =
              hoverState.barWidth < THUMB_W
                ? hoverState.barWidth / 2
                : Math.max(
                    HALF,
                    Math.min(hoverState.barWidth - HALF, hoverState.x),
                  );
            const arrowOffset = hoverState.x - clampedCenterX; // 화살표는 실제 커서 위치
            return (
              <div
                className="absolute bottom-full mb-3 pointer-events-none z-10"
                style={{ left: `${clampedCenterX - HALF}px` }}
              >
                <div
                  className="bg-black rounded-md overflow-hidden shadow-xl border border-slate-800"
                  style={{ width: `${THUMB_W}px` }}
                >
                  <img
                    src={`/api/thumb?path=${encodeURIComponent(filePath)}&t=${Math.floor(hoverState.timeMs / 1000)}`}
                    alt=""
                    className="block w-[180px] h-[101px] object-cover bg-black"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility =
                        "hidden";
                    }}
                  />
                  <div className="bg-black text-white text-[10.5px] font-mono font-semibold tabular-nums text-center py-1">
                    {formatTc(hoverState.timeMs)}
                  </div>
                </div>
                <div
                  className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-black"
                  style={{
                    marginLeft: `${HALF - 5 + arrowOffset}px`,
                  }}
                />
              </div>
            );
          })()}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-100 rounded-full" />
          {duration > 0 && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-900 rounded-full"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          )}
          {duration > 0 &&
            items.map((c) => {
              const meta = getCategoryMeta(c.category);
              const pct = (c.videoTimeMs / duration) * 100;
              const kindLabel = c.kind === "praise" ? "좋아요" : "수정";
              return (
                <button
                  key={c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(c.id);
                  }}
                  title={`${kindLabel} · ${meta.label} · ${formatTc(c.videoTimeMs)}`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125"
                  style={{ left: `${pct}%` }}
                >
                  <Marker
                    category={c.category}
                    kind={c.kind}
                    resolved={!!c.resolvedAt}
                  />
                </button>
              );
            })}
          {duration > 0 && (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            >
              <span className="block w-[12px] h-[12px] rounded-full bg-white border-2 border-slate-900 shadow" />
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11px] font-mono text-slate-400 tabular-nums min-w-[52px] text-right">
          {formatTc(duration)}
        </span>
      </div>

      {/* Row 2: 컨트롤 */}
      <div className="flex items-center gap-1">
        {/* V5 클러스터 (라이트 테마) */}
        <div className="shrink-0 flex items-center bg-slate-50 border border-slate-200 rounded-full p-0.5">
          <button
            onClick={() => jump(-10)}
            className="h-7 px-2.5 rounded-full text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 text-[10.5px] font-bold font-mono tabular-nums transition-all"
            title="10초 뒤로 (Shift+←)"
          >
            10초
          </button>
          <button
            onClick={() => jump(-3)}
            className="h-7 px-2.5 rounded-full text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 text-[10.5px] font-bold font-mono tabular-nums transition-all"
            title="3초 뒤로 (←)"
          >
            3초
          </button>
          <button
            onClick={onTogglePlay}
            className="h-8 w-8 rounded-full bg-slate-900 text-white grid place-items-center mx-0.5 shadow hover:bg-slate-700 transition-colors"
            title={playing ? "일시정지 (Space/K)" : "재생 (Space/K)"}
          >
            {playing ? (
              <Pause size={12} strokeWidth={2.2} fill="currentColor" />
            ) : (
              <Play size={12} strokeWidth={2.2} fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => jump(3)}
            className="h-7 px-2.5 rounded-full text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 text-[10.5px] font-bold font-mono tabular-nums transition-all"
            title="3초 앞으로 (→)"
          >
            3초
          </button>
          <button
            onClick={() => jump(10)}
            className="h-7 px-2.5 rounded-full text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 text-[10.5px] font-bold font-mono tabular-nums transition-all"
            title="10초 앞으로 (Shift+→)"
          >
            10초
          </button>
        </div>

        {/* 구분선 */}
        <div className="w-px h-6 bg-slate-200 mx-2" />

        {/* 이전/다음 피드백 */}
        <button
          onClick={() => gotoFeedback("prev")}
          disabled={items.length === 0}
          className="h-8 px-2.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="이전 피드백 ([ 키)"
        >
          <SkipBack size={13} strokeWidth={2.2} fill="currentColor" />
          이전 피드백
        </button>
        <button
          onClick={() => gotoFeedback("next")}
          disabled={items.length === 0}
          className="h-8 px-2.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="다음 피드백 (] 키)"
        >
          다음 피드백
          <SkipForward size={13} strokeWidth={2.2} fill="currentColor" />
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          {/* 재생 속도 */}
          <div className="relative">
            <button
              onClick={() => setSpeedMenuOpen((v) => !v)}
              className={`h-8 px-2 rounded-md text-[11px] font-bold font-mono tabular-nums transition-colors ${
                playbackRate !== 1
                  ? "text-slate-900 bg-slate-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
              title="재생 속도 (&lt; / &gt; 키)"
            >
              {playbackRate}x
            </button>
            {speedMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSpeedMenuOpen(false)}
                />
                <div className="absolute bottom-full right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 min-w-[90px]">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        onChangePlaybackRate(rate);
                        setSpeedMenuOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-[11.5px] font-mono font-semibold tabular-nums hover:bg-slate-50 flex items-center justify-between ${
                        playbackRate === rate
                          ? "text-slate-900"
                          : "text-slate-600"
                      }`}
                    >
                      <span>{rate}x</span>
                      {playbackRate === rate && (
                        <Check size={11} strokeWidth={2.5} className="text-emerald-500" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onToggleMute}
            className="w-8 h-8 rounded-md grid place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title={muted ? "음소거 해제" : "음소거"}
          >
            {muted ? (
              <VolumeX size={15} strokeWidth={2} />
            ) : (
              <Volume2 size={15} strokeWidth={2} />
            )}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="w-8 h-8 rounded-md grid place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="전체화면"
          >
            <Maximize size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  isAdmin,
  filePath,
  selected,
  canEdit,
  onSelect,
  onResolve,
  onChangeCategory,
  onChangeKind,
  onDelete,
  onReplied,
  onDeleteReply,
}: {
  comment: CommentRow;
  replies: CommentRow[];
  currentUserId: string;
  isAdmin: boolean;
  filePath: string;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onResolve: () => void;
  onChangeCategory: (cat: Category) => void;
  onChangeKind: (kind: Kind) => void;
  onDelete: () => void;
  onReplied: () => void;
  onDeleteReply: (id: string, authorName: string) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [resolvePending, setResolvePending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isResolved = !!comment.resolvedAt;
  const isPraise = comment.kind === "praise";
  const isAI = comment.authorId === "ai-reviewer";
  const meta = getCategoryMeta(comment.category);

  const annotation = comment.annotation;
  const hasKeywordFormat =
    isAI && annotation && annotation.original && annotation.suggestion;

  return (
    <div
      className={`bg-white rounded-lg p-3 transition-colors ${
        selected
          ? "border-2 border-slate-900"
          : "border border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex gap-2.5">
        {/* 좌측: 해결 체크박스 (클릭 전파 차단) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (resolvePending) return; // 이중 클릭 방지
            setResolvePending(true);
            onResolve();
            // 애니메이션 + API round-trip 여유 (600ms)
            setTimeout(() => setResolvePending(false), 700);
          }}
          disabled={resolvePending}
          className={`check-jelly shrink-0 w-5 h-5 rounded-full grid place-items-center mt-0.5 ${
            isResolved
              ? "checked bg-emerald-500 text-white border-2 border-emerald-500"
              : "border-2 border-slate-300 hover:border-emerald-500 transition-colors"
          }`}
          title={isResolved ? "확인 취소" : "확인 완료"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          >
            <polyline points="20 6 9 17 4 12" pathLength={24} />
          </svg>
        </button>

        {/* 중앙 본문: 클릭 시 해당 시각으로 이동 */}
        <button
          onClick={onSelect}
          className="flex-1 min-w-0 text-left block"
        >
          {/* 메타 행 */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded tabular-nums">
              {formatTc(comment.videoTimeMs)}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              style={{ color: meta.color, background: meta.bgSoft }}
              title={meta.label}
            >
              <CategoryIcon category={comment.category} size={9} stroke={2.4} />
              {meta.label}
            </span>
            {isPraise && (
              <Heart
                size={11}
                strokeWidth={2.2}
                fill={PRAISE_COLOR}
                color={PRAISE_COLOR}
              />
            )}
            <span className="text-[10.5px] text-slate-400 ml-auto inline-flex items-center gap-1 shrink-0">
              {isAI ? (
                <>
                  <span className="w-3 h-3 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 inline-flex items-center justify-center">
                    <Sparkles size={7} className="text-white" strokeWidth={2.5} />
                  </span>
                  AI
                </>
              ) : (
                comment.authorName
              )}
            </span>
          </div>

          {/* 본문 */}
          {hasKeywordFormat ? (
            <div className="text-[13px] font-medium text-slate-900 mb-0.5">
              "{annotation.original}"{" "}
              <span className="text-slate-300 mx-0.5">→</span>{" "}
              <span className="text-orange-600">"{annotation.suggestion}"</span>
            </div>
          ) : (
            <div className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">
              {comment.body}
            </div>
          )}

          {/* 서브 정보 */}
          <div className="flex items-center mt-1">
            {hasKeywordFormat && annotation.note ? (
              <span className="text-[11px] text-slate-500 truncate">
                {annotation.note}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                {formatRelative(comment.createdAt)}
              </span>
            )}
          </div>
        </button>

        {/* 우측: 답글 + 더보기 */}
        <div className="shrink-0 flex items-start gap-0.5 mt-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setReplyOpen((v) => !v);
            }}
            className={`w-6 h-6 rounded grid place-items-center transition-colors relative ${
              replyOpen
                ? "bg-slate-900 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            title="답글"
          >
            <CornerDownRight size={12} strokeWidth={2.2} />
            {replies.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-slate-900 text-white text-[9px] font-bold grid place-items-center">
                {replies.length}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="w-6 h-6 rounded grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="더보기"
            >
              <MoreHorizontal size={13} strokeWidth={2.2} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px] z-20">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onChangeKind(isPraise ? "feedback" : "praise");
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11.5px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                  >
                    {isPraise ? (
                      <>
                        <PencilLine size={11} strokeWidth={2.2} />
                        수정으로 변경
                      </>
                    ) : (
                      <>
                        <Heart size={11} strokeWidth={2.2} />
                        좋아요로 변경
                      </>
                    )}
                  </button>
                  <div className="border-t border-slate-100 my-0.5" />
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                    카테고리
                  </div>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => {
                        setMenuOpen(false);
                        if (cat.key !== comment.category) onChangeCategory(cat.key);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-[11.5px] inline-flex items-center gap-2 hover:bg-slate-50 ${
                        cat.key === comment.category ? "font-bold" : ""
                      }`}
                      style={{ color: cat.color }}
                    >
                      <CategoryIcon category={cat.key} size={11} stroke={2.2} />
                      {cat.label}
                      {cat.key === comment.category && (
                        <Check size={10} strokeWidth={2.5} className="ml-auto text-emerald-500" />
                      )}
                    </button>
                  ))}
                  {canEdit && (
                    <>
                      <div className="border-t border-slate-100 my-0.5" />
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete();
                        }}
                        className="w-full px-3 py-1.5 text-left text-[11.5px] text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
                      >
                        <Trash2 size={11} strokeWidth={2.2} />
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 답글 인라인 표시 (항상) */}
      {replies.length > 0 && (
        <div className="mt-2.5 ml-7 pl-3 border-l-2 border-slate-100 space-y-1.5">
          {replies.map((r) => {
            const rCanEdit = r.authorId === currentUserId || isAdmin;
            return (
              <div
                key={r.id}
                className="group flex items-start gap-2 text-[11.5px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">
                      {r.authorName}
                    </span>
                    <span className="text-slate-400 text-[10.5px]">
                      {formatRelative(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-slate-700 whitespace-pre-wrap break-words">
                    {r.body}
                  </div>
                </div>
                {rCanEdit && (
                  <button
                    onClick={() => onDeleteReply(r.id, r.authorName)}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                    title="답글 삭제"
                  >
                    <Trash2 size={10} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 답글 입력창 (토글) */}
      {replyOpen && (
        <div className="mt-2.5 ml-7 pl-3 border-l-2 border-slate-200">
          <ReplyCompose
            filePath={filePath}
            parentId={comment.id}
            parentTimeMs={comment.videoTimeMs}
            parentCategory={comment.category}
            parentKind={comment.kind}
            onPosted={() => {
              setReplyOpen(false);
              onReplied();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ReplyCompose({
  filePath,
  parentId,
  parentTimeMs,
  parentCategory,
  parentKind,
  onPosted,
}: {
  filePath: string;
  parentId: string;
  parentTimeMs: number;
  parentCategory: Category;
  parentKind: Kind;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (submitting || !text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          videoTimeMs: parentTimeMs,
          body: text.trim(),
          category: parentCategory,
          kind: parentKind,
          parentId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError("답글 실패: " + (body.error ?? res.statusText));
        return;
      }
      setText("");
      onPosted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex gap-2 items-start mt-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="답글 달기... (⌘+Enter)"
        rows={1}
        className="flex-1 bg-white border border-border rounded px-2 py-1.5 text-[12px] outline-none focus:border-text focus:ring-2 focus:ring-black/5 resize-none"
        autoFocus
      />
      <button
        onClick={submit}
        disabled={submitting || !text.trim()}
        className="w-7 h-7 bg-text text-white rounded grid place-items-center disabled:opacity-40 shrink-0"
        title="답글 등록"
      >
        <SendHorizontal size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

function ComposeBar({
  currentTime,
  filePath,
  onPosted,
}: {
  currentTime: number;
  filePath: string;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [overrideCat, setOverrideCat] = useState<Category | null>(null);
  const [overrideKind, setOverrideKind] = useState<Kind | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { error: toastError } = useToast();

  const detected = detectCategory(text);
  const detectedKind = detectKind(text);
  const category = overrideCat ?? detected;
  const kind = overrideKind ?? detectedKind;
  const meta = getCategoryMeta(category);
  const isPraise = kind === "praise";

  const submit = async () => {
    if (submitting || !text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          videoTimeMs: Math.floor(currentTime),
          body: text.trim(),
          category,
          kind,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError("등록 실패: " + (body.error ?? res.statusText));
        return;
      }
      setText("");
      setOverrideCat(null);
      setOverrideKind(null);
      onPosted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-slate-200 p-3 bg-white">
      <div
        className={`rounded-lg border transition-colors ${
          isPraise && text.trim()
            ? "border-pink-300 bg-pink-50/30"
            : "border-slate-200 bg-slate-50 focus-within:border-slate-400 focus-within:bg-white"
        }`}
      >
        {/* 상단 메타: 타임코드 + 모드 토글 */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <span
            className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded"
            title="현재 재생 시간"
          >
            {formatTc(currentTime)}
          </span>
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5">
            <button
              onClick={() => setOverrideKind("feedback")}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold transition-colors ${
                !isPraise
                  ? "bg-slate-900 text-white"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="수정 요청"
            >
              <PencilLine size={10} strokeWidth={2.4} />
              수정
            </button>
            <button
              onClick={() => setOverrideKind("praise")}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold transition-colors ${
                isPraise
                  ? "bg-pink-500 text-white"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="좋아요"
            >
              <Heart size={10} strokeWidth={2.4} />
              좋아요
            </button>
          </div>
          <div className="ml-auto relative">
            {/* 카테고리 선택 */}
            <button
              onClick={() => setCatOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold transition-colors"
              style={{
                color: meta.color,
                background: meta.bgSoft,
              }}
              title="카테고리"
            >
              <CategoryIcon category={category} size={10} stroke={2.4} />
              {meta.label}
              <span className="text-[8px] opacity-60">▾</span>
            </button>
            {catOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setCatOpen(false)}
                />
                <div className="absolute z-20 right-0 bottom-full mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[110px]">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => {
                        setCatOpen(false);
                        setOverrideCat(cat.key);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-[11.5px] flex items-center gap-2 hover:bg-slate-50 ${
                        cat.key === category ? "font-bold" : ""
                      }`}
                      style={{ color: cat.color }}
                    >
                      <CategoryIcon category={cat.key} size={11} stroke={2.2} />
                      {cat.label}
                      {cat.key === category && (
                        <Check
                          size={10}
                          strokeWidth={2.5}
                          className="ml-auto text-emerald-500"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 입력 + 전송 */}
        <div className="flex items-end gap-2 px-3 pb-2.5 pt-0.5">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (overrideCat) setOverrideCat(null);
              if (overrideKind) setOverrideKind(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              isPraise
                ? "뭐가 좋았어요? (⌘+Enter)"
                : "피드백을 입력하세요 (⌘+Enter)"
            }
            rows={2}
            className="flex-1 bg-transparent text-[12.5px] outline-none resize-none placeholder:text-slate-400"
          />
          <button
            onClick={submit}
            disabled={submitting || !text.trim()}
            className={`w-8 h-8 rounded-md grid place-items-center disabled:opacity-40 disabled:pointer-events-none transition-colors ${
              isPraise
                ? "bg-pink-500 text-white hover:bg-pink-600"
                : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
            title="등록 (⌘+Enter)"
          >
            <SendHorizontal size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// Annotation 관련 컴포넌트
// ====================================================================

function AnnotationOverlay({
  bbox,
  original,
  suggestion,
  color,
  resolved,
  isPraise,
  onClick,
}: {
  bbox: { x: number; y: number; w: number; h: number };
  original: string;
  suggestion: string;
  color: string;
  resolved: boolean;
  isPraise: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="absolute cursor-pointer"
        style={{
          left: `${bbox.x * 100}%`,
          top: `${bbox.y * 100}%`,
          width: `${bbox.w * 100}%`,
          height: `${bbox.h * 100}%`,
          border: `2.5px ${resolved ? "dashed" : "solid"} ${color}`,
          borderRadius: 4,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.4), 0 0 12px ${color}66`,
          opacity: resolved ? 0.5 : 1,
          zIndex: 4,
        }}
      />
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="absolute cursor-pointer"
        style={{
          left: `${(bbox.x + bbox.w / 2) * 100}%`,
          top: `${(bbox.y + bbox.h) * 100}%`,
          transform: "translate(-50%, 8px)",
          zIndex: 5,
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold whitespace-nowrap"
          style={{
            background: isPraise ? color : "#fff",
            color: isPraise ? "#fff" : "#1a1a1a",
            boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {isPraise ? (
            <span style={{ fontWeight: 700 }}>{suggestion || original}</span>
          ) : (
            <>
              <span style={{ color: "#dc2626", textDecoration: "line-through" }}>
                {original}
              </span>
              <span style={{ color: "#a1a1aa" }}>→</span>
              <span style={{ color: PRAISE_COLOR, fontWeight: 700 }}>
                {suggestion}
              </span>
            </>
          )}
        </span>
      </div>
    </>
  );
}

function AnnotationDragLayer({
  onComplete,
}: {
  onComplete: (
    bbox: { x: number; y: number; w: number; h: number },
    popoverPos: { left: string; top: string },
  ) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);

  const onDown = (e: React.MouseEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ startX: x, startY: y, x, y });
  };

  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const rect = layerRef.current!.getBoundingClientRect();
    setDrag({
      ...drag,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const onUp = () => {
    if (!drag || !layerRef.current) return;
    const rect = layerRef.current.getBoundingClientRect();
    const x1 = Math.min(drag.startX, drag.x);
    const y1 = Math.min(drag.startY, drag.y);
    const x2 = Math.max(drag.startX, drag.x);
    const y2 = Math.max(drag.startY, drag.y);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 15 || h < 10) {
      setDrag(null);
      return;
    }
    const bbox = {
      x: x1 / rect.width,
      y: y1 / rect.height,
      w: w / rect.width,
      h: h / rect.height,
    };
    // popover 위치: bbox 아래 중앙
    const popoverPos = {
      left: `${(bbox.x + bbox.w / 2) * 100}%`,
      top: `${(bbox.y + bbox.h) * 100}%`,
    };
    onComplete(bbox, popoverPos);
    setDrag(null);
  };

  const rect =
    drag && {
      left: Math.min(drag.startX, drag.x),
      top: Math.min(drag.startY, drag.y),
      width: Math.abs(drag.x - drag.startX),
      height: Math.abs(drag.y - drag.startY),
    };

  return (
    <div
      ref={layerRef}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => setDrag(null)}
      className="absolute inset-0 z-10"
      style={{ cursor: "crosshair" }}
    >
      {rect && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            border: "2px dashed #eab308",
            background: "rgba(234,179,8,0.15)",
          }}
        >
          <span
            className="absolute bg-amber-400 text-black px-2 py-0.5 rounded font-bold whitespace-nowrap"
            style={{
              fontSize: 10.5,
              left: "50%",
              transform: "translateX(-50%)",
              bottom: -24,
            }}
          >
            선택 중...
          </span>
        </div>
      )}
    </div>
  );
}

function AnnotationPopover({
  anno,
  pos,
  onChange,
  onCancel,
  onSubmit,
}: {
  anno: PendingAnno;
  pos: { left: string; top: string };
  onChange: (a: PendingAnno) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isPraise = anno.kind === "praise";
  return (
    <div
      className="absolute z-50"
      style={{
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, 16px)",
        width: 320,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-xl shadow-2xl p-3.5 text-[13px]">
        <div className="flex items-center gap-1.5 mb-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: isPraise ? PRAISE_COLOR : "#eab308" }}
          />
          <span className="text-[10.5px] font-bold tracking-widest uppercase text-text-faint">
            {isPraise ? "좋아요" : "자막 수정"}
          </span>
          <button
            onClick={onCancel}
            className="ml-auto w-5 h-5 grid place-items-center rounded hover:bg-hover text-text-faint"
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        </div>

        {/* Kind toggle */}
        <div className="flex gap-1 bg-surface p-0.5 rounded-md mb-2.5">
          <button
            onClick={() => onChange({ ...anno, kind: "feedback" })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[11.5px] font-semibold rounded ${
              !isPraise ? "bg-white shadow-sm text-amber-600" : "text-text-faint"
            }`}
          >
            <PencilLine size={11} strokeWidth={2.3} />
            수정 요청
          </button>
          <button
            onClick={() => onChange({ ...anno, kind: "praise" })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[11.5px] font-semibold rounded ${
              isPraise ? "bg-white shadow-sm" : "text-text-faint"
            }`}
            style={isPraise ? { color: PRAISE_COLOR } : undefined}
          >
            <Heart size={11} strokeWidth={2.3} fill={isPraise ? PRAISE_COLOR : "none"} />
            좋아요
          </button>
        </div>

        <div className="mb-2">
          <label className="block text-[10.5px] font-semibold text-text-soft mb-1 tracking-wide flex items-center gap-1.5">
            {isPraise ? "대상 (자동 인식됨)" : "원본 자막"}
            {anno.ocrLoading && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-normal">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                인식 중...
              </span>
            )}
            {!anno.ocrLoading && anno.original && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-normal">
                ✓ 자동 인식됨
              </span>
            )}
          </label>
          <input
            value={anno.original}
            onChange={(e) =>
              onChange({ ...anno, original: e.target.value, ocrLoading: false })
            }
            placeholder={
              anno.ocrLoading ? "자막 읽는 중..." : "드래그한 텍스트"
            }
            className={`w-full px-2.5 py-1.5 border rounded-md text-[13px] outline-none focus:border-text ${
              anno.ocrLoading
                ? "bg-amber-50 border-amber-300"
                : anno.original
                  ? "bg-amber-50 border-amber-300 font-semibold"
                  : "border-border"
            }`}
          />
        </div>

        {!isPraise && (
          <div className="mb-2">
            <label className="block text-[10.5px] font-semibold text-text-soft mb-1 tracking-wide">
              → 수정안
            </label>
            <input
              value={anno.suggestion}
              onChange={(e) => onChange({ ...anno, suggestion: e.target.value })}
              placeholder="예: agent"
              className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] outline-none focus:border-text"
            />
          </div>
        )}

        {isPraise && (
          <div className="mb-2">
            <label className="block text-[10.5px] font-semibold text-text-soft mb-1 tracking-wide">
              좋은 점
            </label>
            <input
              value={anno.suggestion}
              onChange={(e) => onChange({ ...anno, suggestion: e.target.value })}
              placeholder="예: 이 구간 색감 완벽!"
              className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] outline-none focus:border-text"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-[10.5px] font-semibold text-text-soft mb-1 tracking-wide">
            부가 설명 (선택)
          </label>
          <input
            value={anno.note}
            onChange={(e) => onChange({ ...anno, note: e.target.value })}
            placeholder="예: 영문 통일"
            className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] outline-none focus:border-text"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] font-semibold text-text-soft rounded-md hover:bg-hover"
          >
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={!anno.original.trim() || !anno.suggestion.trim()}
            className="px-3 py-1.5 text-[12px] font-bold rounded-md disabled:opacity-40"
            style={{
              background: isPraise ? PRAISE_COLOR : "#eab308",
              color: isPraise ? "#fff" : "#1a1a1a",
            }}
          >
            등록 (⌘↵)
          </button>
        </div>
      </div>
    </div>
  );
}

// 사용 안 하는 아이콘 warn 억제
