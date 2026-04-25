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
