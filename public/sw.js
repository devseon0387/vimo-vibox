/* 비박스 Service Worker v1
 *
 * 전략:
 * - 앱셸 (정적 자산): cache-first
 * - 페이지 (HTML navigation): network-first → fallback cache (offline 시 마지막 화면)
 * - 파일/스트림 (영상·HLS): 캐시 X (대용량, 빠르게 cache 가득 참)
 * - API GET: network-only (인증·실시간성)
 * - API POST: 그대로 통과 (큰 파일 업로드는 SW 안 거치는 게 안전)
 *
 * vinote와 다른 점: 업로드/스트리밍이 메인이라 API 캐싱 보수적.
 */
const VERSION = "vibox-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;

const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 파일/스트림은 캐시 안 함 (메모리·용량 보호)
  if (
    url.pathname.startsWith("/api/download") ||
    url.pathname.startsWith("/api/stream") ||
    url.pathname.startsWith("/api/thumb") ||
    url.pathname.startsWith("/api/upload") ||
    url.pathname.startsWith("/api/files") // listDirectory 응답은 빨라야
  ) {
    return;
  }

  // API GET — network-only (인증·실시간)
  if (url.pathname.startsWith("/api/")) return;

  // 정적 자산 — cache-first
  if (
    url.pathname.startsWith("/_next/") ||
    /\.(?:js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|avif|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // HTML navigation — network-first
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(SHELL_CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return cached || new Response("offline", { status: 503 });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const c = await caches.open(PAGE_CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response("offline", { status: 503 });
  }
}
