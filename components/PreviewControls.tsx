"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Play,
  Pause,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  Maximize,
  Settings2,
  Check,
} from "lucide-react";

/**
 * 보기 전용 커스텀 컨트롤 바 — 검수 뷰어(FeedbackModal TimelineStrip)와 동일 디자인 언어.
 * 댓글 마커·코멘트 네비는 없음(미리보기/폴더 공유엔 댓글이 없으므로). 영상 아래 어두운 바.
 */
function formatTc(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PreviewControls({
  videoRef,
  shellRef,
  hasHls = false,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  shellRef: RefObject<HTMLDivElement | null>;
  hasHls?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0); // ms
  const [dur, setDur] = useState(0); // ms
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [isFs, setIsFs] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const frameDurRef = useRef(1 / 30);

  // 비디오 → state 동기화
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCur(v.currentTime * 1000);
    const onDur = () =>
      setDur(Number.isFinite(v.duration) ? v.duration * 1000 : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => setMuted(v.muted);
    onDur();
    setMuted(v.muted);
    setPlaying(!v.paused);
    setCur(v.currentTime * 1000);
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
  }, [videoRef]);

  // 프레임 길이 실측 (검수 뷰어와 동일)
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
  }, [videoRef]);

  // 전체화면 상태
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, [videoRef]);

  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      const max = Number.isFinite(v.duration) ? v.duration : Infinity;
      v.currentTime = Math.max(
        0,
        Math.min(max, v.currentTime + dir * frameDurRef.current),
      );
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const changeRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (v) v.playbackRate = r;
      setRate(r);
    },
    [videoRef],
  );

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
    };
    const fsEl = document.fullscreenElement ?? doc.webkitFullscreenElement;
    if (fsEl) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else doc.webkitExitFullscreen?.();
      return;
    }
    const shell = shellRef.current;
    const v = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (shell && typeof shell.requestFullscreen === "function")
      shell.requestFullscreen().catch(() => {});
    else if (v && typeof v.webkitEnterFullscreen === "function")
      v.webkitEnterFullscreen();
  }, [shellRef, videoRef]);

  // 시크바 — 검수 뷰어와 동일한 접근성 슬라이더(드래그·키보드)
  const posFromClientX = (clientX: number): number | null => {
    if (!barRef.current || dur <= 0) return null;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * dur;
  };
  const scrub = (ms: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration))
      v.currentTime = Math.max(0, Math.min(v.duration, ms / 1000));
  };
  const onBarPointerDown = (e: React.PointerEvent) => {
    const ms = posFromClientX(e.clientX);
    if (ms === null) return;
    draggingRef.current = true;
    try {
      barRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    scrub(ms);
  };
  const onBarPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const ms = posFromClientX(e.clientX);
    if (ms !== null) scrub(ms);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      barRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };
  const onBarKeyDown = (e: React.KeyboardEvent) => {
    if (dur <= 0) return;
    const v = videoRef.current;
    if (!v) return;
    const live = v.currentTime * 1000;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = live - 5000;
        break;
      case "ArrowRight":
        next = live + 5000;
        break;
      case "PageDown":
        next = live - 10000;
        break;
      case "PageUp":
        next = live + 10000;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = dur;
        break;
      default:
        return;
    }
    e.preventDefault();
    scrub(Math.max(0, Math.min(dur, next)));
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="flex-none bg-[#0b0f17] border-t border-[#1e293b] px-4 pt-2.5 pb-3 select-none">
      {/* Row 1: 시크바 */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm font-mono font-semibold text-slate-300 tabular-nums">
          {formatTc(cur)}
        </span>
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="재생 위치"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(dur / 1000))}
          aria-valuenow={Math.round(cur / 1000)}
          aria-valuetext={`${formatTc(cur)} / ${formatTc(dur)}`}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onBarKeyDown}
          className="relative h-[18px] cursor-pointer flex-1 touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f17]"
        >
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-700" />
          {dur > 0 && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-accent"
              style={{ width: `${pct}%` }}
            />
          )}
          {dur > 0 && (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-[3] pointer-events-none"
              style={{ left: `${pct}%` }}
            >
              <span
                className="block w-[15px] h-[15px] rounded-full bg-white"
                style={{ boxShadow: "0 0 0 2px #e85008, 0 1px 5px rgba(0,0,0,.6)" }}
              />
            </div>
          )}
        </div>
        <span className="shrink-0 text-sm font-mono text-slate-500 tabular-nums text-right">
          {formatTc(dur)}
        </span>
      </div>

      {/* Row 2: 컨트롤 */}
      <div className="flex items-center gap-2.5 mt-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => stepFrame(-1)}
            title="이전 프레임"
            aria-label="이전 프레임"
            className="w-9 h-9 rounded-[9px] grid place-items-center text-slate-300 hover:bg-white/10 transition-colors"
          >
            <StepBack size={18} strokeWidth={2} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            title={playing ? "일시정지" : "재생"}
            aria-label={playing ? "일시정지" : "재생"}
            className="w-11 h-11 rounded-full bg-accent text-white grid place-items-center shadow-[0_4px_14px_rgba(232,80,8,0.4)] hover:opacity-90 transition-opacity"
          >
            {playing ? (
              <Pause size={20} strokeWidth={2.4} fill="currentColor" />
            ) : (
              <Play size={20} strokeWidth={2.4} fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => stepFrame(1)}
            title="다음 프레임"
            aria-label="다음 프레임"
            className="w-9 h-9 rounded-[9px] grid place-items-center text-slate-300 hover:bg-white/10 transition-colors"
          >
            <StepForward size={18} strokeWidth={2} fill="currentColor" />
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            title={muted ? "음소거 해제" : "음소거"}
            aria-label={muted ? "음소거 해제" : "음소거"}
            aria-pressed={muted}
            className="w-9 h-9 rounded-[9px] grid place-items-center text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
          >
            {muted ? (
              <VolumeX size={17} strokeWidth={2} />
            ) : (
              <Volume2 size={17} strokeWidth={2} />
            )}
          </button>
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title="재생 속도"
              aria-label="재생 속도"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              className={`relative w-9 h-9 rounded-[9px] grid place-items-center transition-colors ${
                settingsOpen
                  ? "text-white bg-white/10"
                  : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              <Settings2 size={17} strokeWidth={2} />
              {rate !== 1 && (
                <span className="absolute -top-0.5 -right-1 px-1 py-px rounded text-[8px] font-bold leading-none ring-[1.5px] ring-[#0b0f17] bg-accent text-white">
                  {rate}×
                </span>
              )}
            </button>
            {settingsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSettingsOpen(false)}
                />
                <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-20 w-[240px]">
                  <div className="px-2 pt-1 pb-1.5 text-2xs font-bold text-slate-400 tracking-wide">
                    재생 속도
                  </div>
                  <div className="flex flex-nowrap gap-1 px-1 pb-1.5">
                    {SPEEDS.map((r) => (
                      <button
                        key={r}
                        onClick={() => changeRate(r)}
                        className={`flex-1 h-7 rounded-md text-2xs font-bold font-mono tabular-nums grid place-items-center transition-colors ${
                          rate === r
                            ? "bg-accent text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                  {hasHls && (
                    <div className="px-2 py-1 text-2xs text-slate-400 leading-relaxed border-t border-slate-100 mt-0.5 pt-1.5">
                      <Check size={11} strokeWidth={2.5} className="inline text-accent" /> 스트리밍 최적화 재생 중
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            title="전체화면"
            aria-label="전체화면"
            className="w-9 h-9 rounded-[9px] grid place-items-center text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
          >
            <Maximize size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
