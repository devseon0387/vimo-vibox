"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type KeyboardEvent as RKeyboardEvent,
} from "react";
import {
  Play,
  Pause,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  Download,
  MessageSquare,
  X,
  SendHorizontal,
  Hand,
} from "lucide-react";
import { attachHls } from "@/lib/hls-client";

/**
 * 숏폼(세로 9:16) 게스트 검수 — 모바일 전용 몰입 플레이어.
 * 모델: "재생 = 깨끗 / 정지 = 전부 등장".
 *  - 진입 2.5초만 크롬(상단·댓글·힌트) → 페이드 → 순수 영상
 *  - 화면 탭 = 일시정지 + 시크바·프레임스텝·입력·댓글 전부 등장 (그 프레임에 정확히 코멘트)
 *  - 전송 = 마커 추가 + 재생 재개
 * 공유 댓글 API(/api/s/[token]/comments)·HLS·시청추적 재사용. FeedbackModal은 무관.
 */

type CommentRow = {
  id: string;
  authorName: string;
  guestName: string | null;
  videoTimeMs: number;
  kind: string;
  body: string;
  parentId: string | null;
  resolvedAt: number | null;
  authorId: string;
  createdAt: number;
};

function formatTc(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// 검수 뷰어(FeedbackModal.statusOf)와 동일 규칙·색으로 결속 — 같은 코멘트가 뷰어마다 다른
// 색/분류(AI 판별 방식·보라 색조)로 보이지 않게. 미해결=주황 · AI=보라 · 좋아요=녹색 · 해결=회색(우선).
function markerColor(c: CommentRow): string {
  // 우선순위까지 FeedbackModal.statusOf와 동일하게: 해결 > 좋아요 > AI > 미해결(accent).
  if (c.resolvedAt) return "#94a3b8";
  if (c.kind === "praise") return "#16a34a";
  if (c.authorId === "ai-reviewer") return "#7c3aed";
  return "#e85008";
}

const HIDE_MS = 2500;

export function ShortformReview({
  token,
  filePath,
  fallbackSrc,
  title,
  allowDownload,
  guestName,
  onSetGuestName,
}: {
  token: string;
  filePath: string;
  fallbackSrc: string;
  title: string;
  allowDownload: boolean;
  guestName: string;
  onSetGuestName: (n: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const frameDurRef = useRef(1 / 30);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [curMs, setCurMs] = useState(0);
  const [durMs, setDurMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState(guestName);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ---- HLS lookup + attach (HlsVideo와 동일 경로) ----
  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/stream/lookup?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`,
        );
        if (cancelled || !r.ok) return;
        const data = await r.json();
        if (data.ready && data.manifestUrl) setManifestUrl(data.manifestUrl);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, token]);

  useEffect(() => {
    if (!manifestUrl) return;
    const v = videoRef.current;
    if (!v) return;
    let handle: { destroy: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      handle = await attachHls(v, manifestUrl);
      if (cancelled) handle.destroy();
    })();
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [manifestUrl]);

  // ---- 댓글 로드 ----
  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/s/${encodeURIComponent(token)}/comments?p=${encodeURIComponent(filePath)}`,
      );
      if (!r.ok) return;
      const data = await r.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {}
  }, [token, filePath]);
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const topMarkers = comments.filter((c) => !c.parentId);

  // ---- 비디오 → state ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurMs(v.currentTime * 1000);
    const onDur = () =>
      setDurMs(Number.isFinite(v.duration) ? v.duration * 1000 : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => setMuted(v.muted);
    onDur();
    setMuted(v.muted);
    setPlaying(!v.paused);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  // ---- 프레임 길이 실측 (rVFC) ----
  useEffect(() => {
    type RVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { mediaTime: number }) => void,
      ) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const v = videoRef.current as RVFC | null;
    if (!v || typeof v.requestVideoFrameCallback !== "function") return;
    let handle = 0;
    let last = -1;
    let best = Infinity;
    let samples = 0;
    let cancelled = false;
    const cb = (_n: number, meta: { mediaTime: number }) => {
      if (cancelled) return;
      const mt = meta.mediaTime;
      if (last >= 0) {
        const d = mt - last;
        if (d > 0.002 && d < 0.2) {
          if (d < best) best = d;
          if (++samples >= 4 && best >= 1 / 120 && best <= 1 / 12)
            frameDurRef.current = best;
        }
      }
      last = mt;
      handle = v.requestVideoFrameCallback!(cb);
    };
    handle = v.requestVideoFrameCallback(cb);
    return () => {
      cancelled = true;
      v.cancelVideoFrameCallback?.(handle);
    };
  }, []);

  // ---- 시청 추적 (공유 ping, HlsVideo와 동일 비콘) ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !filePath) return;
    let lastTick = 0;
    let acc = 0;
    let lastPos = 0;
    let opened = false;
    const send = (force = false) => {
      const now = Date.now();
      if (!force && now - lastTick < 9000) return;
      lastTick = now;
      const payload = {
        filePath,
        positionSec: v.currentTime,
        durationSec: Number.isFinite(v.duration) ? v.duration : null,
        watchedDeltaSec: acc,
      };
      acc = 0;
      void fetch(`/api/s/${encodeURIComponent(token)}/ping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    };
    const onPlay = () => {
      lastPos = v.currentTime;
      if (!opened) {
        opened = true;
        send(true);
      }
    };
    const onTime = () => {
      if (v.paused) return;
      const dt = v.currentTime - lastPos;
      if (dt > 0 && dt < 2.5) acc += dt;
      lastPos = v.currentTime;
      send();
    };
    const onPause = () => send(true);
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    const onPageHide = () => send(true);
    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onHide);
      // pagehide 도 반드시 해제 — 익명 핸들러였던 과거엔 누수돼 effect 재실행·언마운트마다 쌓였다
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [token, filePath]);

  // ---- 크롬 자동 숨김: 재생 중 2.5초 → 숨김, 정지 = 항상 표시 ----
  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeShown(false), HIDE_MS);
  }, []);
  useEffect(() => {
    if (playing) {
      setChromeShown(true);
      armHide();
    } else {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setChromeShown(true); // 정지 = 전부 등장
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [playing, armHide]);

  // ---- 컨트롤 ----
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  // 영상 탭: 재생 중이면 정지(+크롬), 정지면 재생. 단 시트/입력 열려 있으면 무시.
  const onVideoTap = useCallback(() => {
    if (sheetOpen || composeOpen) return;
    togglePlay();
  }, [sheetOpen, composeOpen, togglePlay]);

  const stepFrame = useCallback((dir: -1 | 1) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(
      0,
      Math.min(max, v.currentTime + dir * frameDurRef.current),
    );
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);

  const seekTo = (ms: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration))
      v.currentTime = Math.max(0, Math.min(v.duration, ms / 1000));
  };
  const posFromX = (clientX: number): number | null => {
    if (!barRef.current || durMs <= 0) return null;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * durMs;
  };
  const onBarDown = (e: RPointerEvent) => {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    const ms = posFromX(e.clientX);
    if (ms === null) return;
    draggingRef.current = true;
    try {
      barRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    seekTo(ms);
  };
  const onBarMove = (e: RPointerEvent) => {
    if (!draggingRef.current) return;
    const ms = posFromX(e.clientX);
    if (ms !== null) seekTo(ms);
  };
  const onBarUp = (e: RPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      barRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };
  const onBarKey = (e: RKeyboardEvent) => {
    if (durMs <= 0) return;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const live = v.currentTime * 1000;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = live - 5000;
    else if (e.key === "ArrowRight") next = live + 5000;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = durMs;
    else return;
    e.preventDefault();
    seekTo(Math.max(0, Math.min(durMs, next)));
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = fallbackSrc;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ---- 댓글 작성 ----
  const startCompose = () => {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    setComposeOpen(true);
  };
  const submit = async () => {
    if (submitting || !text.trim() || !name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/s/${encodeURIComponent(token)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          videoTimeMs: Math.floor(curMs),
          body: text.trim(),
          guestName: name.trim(),
        }),
      });
      if (!res.ok) {
        setToast("전송에 실패했어요. 잠시 후 다시 시도해주세요");
        return;
      }
      onSetGuestName(name.trim());
      setText("");
      setComposeOpen(false);
      setToast("의견이 전달됐어요");
      await loadComments();
      const v = videoRef.current;
      v?.play().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // guestName prop이 마운트 이후(localStorage 복원 등) 도착하면 이름 입력칸은 숨겨지는데(needName=false)
  // name(state)은 빈 채로 남아 전송 버튼이 영구 비활성된다 — 비어 있을 때만 prop 으로 동기화.
  useEffect(() => {
    if (guestName.trim() && !name.trim()) setName(guestName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestName]);

  const pct = durMs > 0 ? (curMs / durMs) * 100 : 0;
  const paused = !playing;
  const needName = !guestName.trim();

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none touch-none">
      {/* 영상 */}
      <video
        ref={videoRef}
        src={manifestUrl ? undefined : fallbackSrc}
        playsInline
        onClick={onVideoTap}
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />

      {/* 스크림 (크롬/정지 시) */}
      <div
        className={`absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/55 to-transparent pointer-events-none transition-opacity duration-300 ${chromeShown ? "opacity-100" : "opacity-0"}`}
      />
      {paused && (
        <div className="absolute bottom-0 inset-x-0 h-72 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      )}

      {/* 상단 바 */}
      <div
        className={`absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-4 pt-3 pb-2 transition-opacity duration-300 ${chromeShown ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <span className="flex items-center gap-1.5 font-extrabold text-base text-white tracking-tight shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
          vi<span className="text-accent">.</span>box
        </span>
        <span className="flex-1 min-w-0 truncate text-sm text-white/90">
          {title}
        </span>
        {allowDownload && (
          <button
            onClick={download}
            aria-label="다운로드"
            className="h-8 px-2.5 rounded-lg bg-white/20 backdrop-blur text-white text-xs font-bold inline-flex items-center gap-1"
          >
            <Download size={13} strokeWidth={2.4} />
            받기
          </button>
        )}
      </div>

      {/* 일시정지 글리프 (정지 + 입력 안 열림) */}
      {paused && !composeOpen && (
        <button
          onClick={togglePlay}
          aria-label="재생"
          className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 z-10 w-16 h-16 rounded-full bg-black/45 backdrop-blur-[1px] grid place-items-center text-white"
        >
          <Play size={28} strokeWidth={2.2} fill="currentColor" className="ml-1" />
        </button>
      )}

      {/* 우측 액션 레일 (재생 중 크롬 표시 시: 댓글 열람) */}
      {playing && (
        <div
          className={`absolute right-3 bottom-32 z-20 flex flex-col items-center gap-1 text-white transition-opacity duration-300 ${chromeShown ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <button
            onClick={() => {
              videoRef.current?.pause();
              setSheetOpen(true);
            }}
            aria-label="댓글 보기"
            className="relative w-11 h-11 rounded-full bg-black/40 backdrop-blur grid place-items-center"
          >
            <MessageSquare size={21} strokeWidth={2} />
            {topMarkers.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-accent text-2xs font-bold grid place-items-center">
                {topMarkers.length}
              </span>
            )}
          </button>
          <span className="text-2xs font-bold drop-shadow">댓글</span>
        </div>
      )}

      {/* 진입 힌트 (재생 중 + 크롬 표시 시) */}
      {playing && chromeShown && (
        <div className="absolute left-1/2 bottom-16 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 bg-black/45 backdrop-blur text-white text-sm font-semibold px-3.5 py-2 rounded-full pointer-events-none">
          <Hand size={14} strokeWidth={2.2} />
          화면을 탭하면 멈추고 의견을 남겨요
        </div>
      )}

      {/* 하단 컨트롤 + 입력 (정지 시 전부 등장) */}
      {paused && (
        <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-4 pt-2">
          {/* 시크바 + 마커 */}
          <div
            ref={barRef}
            role="slider"
            tabIndex={0}
            aria-label="재생 위치"
            aria-valuemin={0}
            aria-valuemax={Math.round(durMs / 1000)}
            aria-valuenow={Math.round(curMs / 1000)}
            aria-valuetext={`${formatTc(curMs)} / ${formatTc(durMs)}`}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerCancel={onBarUp}
            onKeyDown={onBarKey}
            className="relative h-5 flex items-center mb-1 touch-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/30" />
            <div
              className="absolute left-0 h-1 rounded-full bg-accent2"
              style={{ width: `${pct}%` }}
            />
            {durMs > 0 &&
              topMarkers.map((c) => (
                <span
                  key={c.id}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                  style={{
                    left: `${Math.min(100, Math.max(0, (c.videoTimeMs / durMs) * 100))}%`,
                    background: markerColor(c),
                    boxShadow: "0 0 0 2px rgba(0,0,0,.4)",
                  }}
                />
              ))}
            {durMs > 0 && (
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white pointer-events-none"
                style={{ left: `${pct}%`, boxShadow: "0 0 0 2px #e85008" }}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-white/80 mb-2">
            <span>{formatTc(curMs)}</span>
            <span>{formatTc(durMs)}</span>
          </div>

          {composeOpen ? (
            /* 댓글 작성 */
            <div className="space-y-2">
              {needName && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름"
                  className="w-full h-10 rounded-xl bg-white px-3.5 text-base outline-none focus:ring-2 focus:ring-text-muted/40"
                />
              )}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-2xs font-bold font-mono bg-accent text-white px-2 py-1.5 rounded-md">
                  {formatTc(curMs)}
                </span>
                <input
                  value={text}
                  autoFocus
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="이 순간에 의견 남기기…"
                  className="flex-1 h-11 rounded-xl bg-white px-3.5 text-base outline-none focus:ring-2 focus:ring-text-muted/40"
                />
                <button
                  onClick={submit}
                  disabled={submitting || !text.trim() || !name.trim()}
                  aria-label="전송"
                  className="shrink-0 w-11 h-11 rounded-full bg-accent text-white grid place-items-center disabled:opacity-40"
                >
                  <SendHorizontal size={17} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          ) : (
            /* 컨트롤: 프레임스텝 + 재생 + 음소거 + 입력 진입 */
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-white">
                <button
                  onClick={() => stepFrame(-1)}
                  aria-label="이전 프레임"
                  className="w-9 h-9 rounded-full grid place-items-center"
                >
                  <StepBack size={18} strokeWidth={2} fill="currentColor" />
                </button>
                <button
                  onClick={togglePlay}
                  aria-label="재생"
                  className="w-12 h-12 rounded-full bg-accent grid place-items-center text-white"
                >
                  <Play size={22} strokeWidth={2.4} fill="currentColor" className="ml-0.5" />
                </button>
                <button
                  onClick={() => stepFrame(1)}
                  aria-label="다음 프레임"
                  className="w-9 h-9 rounded-full grid place-items-center text-white"
                >
                  <StepForward size={18} strokeWidth={2} fill="currentColor" />
                </button>
              </div>
              <button
                onClick={startCompose}
                className="flex-1 h-11 rounded-full bg-white/16 backdrop-blur border border-white/25 text-white/85 text-base text-left px-4"
              >
                이 순간에 의견 남기기…
              </button>
              <button
                onClick={toggleMute}
                aria-label={muted ? "음소거 해제" : "음소거"}
                className="w-9 h-9 rounded-full grid place-items-center text-white/80"
              >
                {muted ? (
                  <VolumeX size={18} strokeWidth={2} />
                ) : (
                  <Volume2 size={18} strokeWidth={2} />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 댓글 읽기 시트 */}
      {sheetOpen && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/35"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 z-40 h-[60%] bg-white rounded-t-[18px] flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,.3)]">
            <div className="w-9 h-1 rounded-full bg-surface-2 mx-auto mt-2 mb-1" />
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-base font-extrabold">
                댓글 {topMarkers.length}
              </span>
              <span className="flex-1" />
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="닫기"
                className="text-text-faint"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto border-t border-border">
              {topMarkers.length === 0 ? (
                <div className="h-full grid place-items-center text-center text-text-faint text-sm px-8">
                  아직 의견이 없어요. 영상을 보다가 탭해서 그 순간에 의견을
                  남겨보세요.
                </div>
              ) : (
                topMarkers
                  .slice()
                  .sort((a, b) => a.videoTimeMs - b.videoTimeMs)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        seekTo(c.videoTimeMs);
                        setSheetOpen(false);
                      }}
                      className="w-full text-left flex gap-2.5 px-4 py-2.5 border-b border-border active:bg-surface"
                    >
                      <span
                        className="shrink-0 w-6 h-6 rounded-full grid place-items-center text-white text-2xs font-bold"
                        style={{ background: markerColor(c) }}
                      >
                        {(c.authorName || "?").slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-2xs font-bold font-mono text-white px-1.5 rounded"
                            style={{ background: markerColor(c) }}
                          >
                            {formatTc(c.videoTimeMs)}
                          </span>
                          <span className="text-2xs text-text-faint">
                            {c.authorName}
                          </span>
                        </span>
                        <span
                          className={`block text-sm leading-snug ${c.resolvedAt ? "text-text-faint line-through" : "text-text"}`}
                        >
                          {c.body}
                        </span>
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 z-50 bg-black/80 text-white text-sm font-semibold px-4 py-2 rounded-full">
          {toast}
        </div>
      )}
    </div>
  );
}
