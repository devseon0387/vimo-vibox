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
const VERSION = "vibox-v2-20260628";
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
      .then(() => self.clients.claim()).then(async () => { try { const all = await self.clients.matchAll({ type: "window" }); for (const c of all) c.navigate(c.url); } catch (e) {} }),
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
    event.respondWith(networkFirst(req));
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

// ── Web Push ────────────────────────────────────────────────
// 서버가 보낸 JSON payload: { title, body, url, tag, icon, data }

self.addEventListener("push", (event) => {
  let payload = { title: "비박스", body: "새 알림", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* payload 없거나 깨짐 — 기본값 사용 */
  }
  const { title, body, url, tag, icon, data } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/", ...(data || {}) },
    }),
  );
});

// ── Background Sync (Chrome 계열 only) ───────────────────────
// chunks 가 모두 올라간 뒤 finalize(complete) 호출이 실패한 경우,
// SW 가 이 sync 이벤트에서 IndexedDB 큐를 비우며 자동 재시도.
const SYNC_TAG_FINALIZE = "vibox-finalize-retry";
const MAX_FINALIZE_ATTEMPTS = 5;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("vibox", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending_finalize")) {
        db.createObjectStore("pending_finalize", { keyPath: "fileId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbList() {
  const db = await idbOpen();
  return await new Promise((resolve, reject) => {
    const t = db.transaction("pending_finalize", "readonly");
    const r = t.objectStore("pending_finalize").getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function idbDelete(fileId) {
  const db = await idbOpen();
  return await new Promise((resolve, reject) => {
    const t = db.transaction("pending_finalize", "readwrite");
    const r = t.objectStore("pending_finalize").delete(fileId);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function idbBump(fileId) {
  const db = await idbOpen();
  return await new Promise((resolve, reject) => {
    const t = db.transaction("pending_finalize", "readwrite");
    const s = t.objectStore("pending_finalize");
    const g = s.get(fileId);
    g.onsuccess = () => {
      const row = g.result;
      if (!row) return resolve();
      row.attempts = (row.attempts || 0) + 1;
      row.lastAttemptAt = Date.now();
      const p = s.put(row);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG_FINALIZE) return;
  event.waitUntil(
    (async () => {
      const pending = await idbList().catch(() => []);
      for (const row of pending) {
        if (row.attempts >= MAX_FINALIZE_ATTEMPTS) {
          await idbDelete(row.fileId);
          continue;
        }
        try {
          const r = await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ fileId: row.fileId, action: "complete" }),
          });
          if (r.ok) {
            await idbDelete(row.fileId);
          } else if (r.status === 404 || r.status === 401) {
            // 세션 만료·세션 사라짐 → 큐에서 제거 (재시도 무의미)
            await idbDelete(row.fileId);
          } else {
            await idbBump(row.fileId);
          }
        } catch {
          await idbBump(row.fileId);
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 이미 열린 같은 origin 탭이 있으면 focus + navigate
      for (const c of all) {
        if (c.url && new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if (typeof c.navigate === "function" && c.url !== new URL(target, self.location.origin).href) {
            try {
              await c.navigate(target);
            } catch {
              /* navigate 실패는 무시 — 사용자가 직접 이동 */
            }
          }
          return;
        }
      }
      // 없으면 새 창
      await self.clients.openWindow(target);
    })(),
  );
});
