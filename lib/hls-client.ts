"use client";

/**
 * 클라이언트 HLS 어태치 헬퍼.
 *
 * 사용법:
 *   const cleanup = await attachHls(videoEl, manifestUrl, directManifestUrl?);
 *   // unmount 시 cleanup() 호출
 *
 * - Safari/iOS: 네이티브 HLS 지원 → 바로 src 할당 (항상 CF=동일오리진, 안전)
 * - Chrome/Firefox/Edge: hls.js 로 어태치. directManifestUrl 이 있으면 u1/u2:8443 직결로
 *   재생(CF LAX 우회) — stream 라우트가 CORS 헤더를 내주고, xhrSetup 으로 쿠키를 함께 보낸다.
 *
 * directManifestUrl 은 "프로브가 직결을 확정했을 때만" 호출부에서 넘긴다(strict). 따라서 여기선
 * 별도 폴백 없이 단순하게 둔다 — 직결이 막힌 환경이면 애초에 undefined 로 와서 CF 로 재생.
 */

export type HlsHandle = {
  destroy: () => void;
};

export async function attachHls(
  video: HTMLVideoElement,
  manifestUrl: string,
  directManifestUrl?: string,
): Promise<HlsHandle> {
  // Safari·iOS HLS 네이티브 — 크로스오리진 네이티브 HLS+쿠키는 까다로워 CF(동일오리진) 유지.
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = manifestUrl;
    return { destroy: () => {} };
  }

  // Chrome/Firefox 등은 hls.js 동적 로드 (번들 사이즈 절감)
  const Hls = (await import("hls.js")).default;
  if (!Hls.isSupported()) {
    // 폴백: 그냥 src 할당 (안 될 가능성 큼) — 직결은 시도 안 함
    video.src = manifestUrl;
    return { destroy: () => {} };
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    // 크로스오리진 직결 시 세그먼트/매니페스트 XHR 에 쿠키 동봉(.vibox.cloud 도메인 쿠키).
    // 동일오리진(CF)일 땐 무해 — 어차피 쿠키는 자동 전송됨.
    xhrSetup: (xhr: XMLHttpRequest) => {
      xhr.withCredentials = true;
    },
  });
  hls.loadSource(directManifestUrl ?? manifestUrl);
  hls.attachMedia(video);

  return {
    destroy: () => {
      try {
        hls.destroy();
      } catch {}
    },
  };
}
