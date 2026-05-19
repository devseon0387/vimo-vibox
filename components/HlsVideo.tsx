"use client";

import { useEffect, useRef, useState } from "react";
import { attachHls } from "@/lib/hls-client";

/**
 * HLS 자동 감지 비디오 플레이어.
 *  - filePath 로 /api/stream/lookup 조회
 *  - HLS 준비됐으면 hls.js로 재생
 *  - 인코딩 중이거나 미준비면 fallbackSrc 로 원본 재생
 *  - 인코딩 진행 중 배지 표시
 */
export function HlsVideo({
  filePath,
  fallbackSrc,
  shareToken,
  className = "",
  controls = true,
  preload = "metadata",
}: {
  filePath: string;
  fallbackSrc: string;
  shareToken?: string;
  className?: string;
  controls?: boolean;
  preload?: "none" | "metadata" | "auto";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<{ progress: number } | null>(null);

  useEffect(() => {
    if (!filePath) return;
    setManifestUrl(null);
    setEncoding(null);
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      const tokenSuffix = shareToken
        ? `&token=${encodeURIComponent(shareToken)}`
        : "";
      try {
        const r = await fetch(
          `/api/stream/lookup?path=${encodeURIComponent(filePath)}${tokenSuffix}`,
        );
        if (cancelled) return;
        if (!r.ok) return;
        const data = await r.json();
        if (data.ready && data.manifestUrl) {
          setManifestUrl(data.manifestUrl);
          setEncoding(null);
        } else if (data.status === "queued" || data.status === "running") {
          setEncoding({ progress: data.progress ?? 0 });
          pollTimer = setTimeout(check, 5000);
        }
      } catch {}
    };
    check();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [filePath, shareToken]);

  useEffect(() => {
    if (!manifestUrl) return;
    const v = ref.current;
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

  // share view tracking — shareToken 있을 때만
  useEffect(() => {
    if (!shareToken || !filePath) return;
    const v = ref.current;
    if (!v) return;

    let lastTickAt = 0;
    let watchAccumulated = 0;
    let lastPosition = 0;
    let openedSent = false;

    const send = (extraDelta = 0, force = false) => {
      const now = Date.now();
      if (!force && now - lastTickAt < 9000) return;
      lastTickAt = now;
      const payload = {
        filePath,
        positionSec: v.currentTime,
        durationSec: Number.isFinite(v.duration) ? v.duration : null,
        watchedDeltaSec: watchAccumulated + extraDelta,
      };
      watchAccumulated = 0;
      void fetch(`/api/s/${encodeURIComponent(shareToken)}/ping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    };

    const onPlay = () => {
      lastPosition = v.currentTime;
      if (!openedSent) {
        openedSent = true;
        send(0, true);
      }
    };
    const onTimeUpdate = () => {
      if (v.paused) return;
      const dt = v.currentTime - lastPosition;
      // 정상 재생만 누적 (seek은 큰 점프라 제외)
      if (dt > 0 && dt < 2.5) watchAccumulated += dt;
      lastPosition = v.currentTime;
      send();
    };
    const onPause = () => send(0, true);
    const onSeeked = () => {
      lastPosition = v.currentTime;
    };
    const onEnded = () => send(0, true);
    const onUnload = () => send(0, true);
    // 모바일 Safari/Chrome: 탭 이동·홈버튼 등 백그라운드 전환 시 pagehide가 안 뜨고
    // visibilitychange만 발생. 두 이벤트 모두 잡아야 시청 시간 정확.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send(0, true);
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ended", onEnded);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ended", onEnded);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shareToken, filePath, manifestUrl]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={ref}
        src={manifestUrl ? undefined : fallbackSrc}
        controls={controls}
        preload={preload}
        className={className}
      />
      {encoding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500/90 text-black px-2.5 py-1 rounded text-[11px] font-bold inline-flex items-center gap-1.5 z-10">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-200 animate-pulse" />
          스트리밍 최적화 중 {encoding.progress}%
        </div>
      )}
    </div>
  );
}
