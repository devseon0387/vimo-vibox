"use client";

/**
 * 클라이언트 HLS 어태치 헬퍼.
 *
 * 사용법:
 *   const cleanup = await attachHls(videoEl, manifestUrl);
 *   // unmount 시 cleanup() 호출
 *
 * - Safari/iOS: 네이티브 HLS 지원 → 바로 src 할당
 * - Chrome/Firefox/Edge: hls.js 로 어태치
 */

export type HlsHandle = {
  destroy: () => void;
};

export async function attachHls(
  video: HTMLVideoElement,
  manifestUrl: string,
): Promise<HlsHandle> {
  // Safari·iOS HLS 네이티브
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = manifestUrl;
    return { destroy: () => {} };
  }

  // Chrome/Firefox 등은 hls.js 동적 로드 (번들 사이즈 절감)
  const Hls = (await import("hls.js")).default;
  if (!Hls.isSupported()) {
    // 폴백: 그냥 src 할당 (안 될 가능성 큼)
    video.src = manifestUrl;
    return { destroy: () => {} };
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });
  hls.loadSource(manifestUrl);
  hls.attachMedia(video);

  return {
    destroy: () => {
      try {
        hls.destroy();
      } catch {}
    },
  };
}
