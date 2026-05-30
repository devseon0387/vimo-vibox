/* 비노트 Service Worker v0.2
 *
 * - 앱셸 precache (오프라인 부팅)
 * - GET API 응답 SWR 캐시 (목록·검색 빠른 표시)
 * - POST /api/notes/v2/save offline 시 큐잉 → online 복귀 시 자동 재전송
 *
 * 주의: API_BASE를 정확히 알아야 함. 비노트 origin과 다른 도메인이라
 * 클라이언트가 SW에 알려주거나, fetch에 origin이 매칭되는지로 판단.
 */
const VERSION = "vinote-v0.2";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  return /\/api\/notes\/v2\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 비-GET 중 save는 별도 처리 (Background Sync로 큐잉)
  if (req.method === "POST" && /\/api\/notes\/v2\/save$/.test(url.pathname)) {
    event.respondWith(handleSave(req));
    return;
  }
  if (req.method !== "GET") return;

  // 같은 origin의 정적 자산 — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // API GET — stale-while-revalidate
  if (isApi(url)) {
    event.respondWith(swr(req));
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

// 노트 API GET — network-first (인증 데이터라 항상 최신 우선, 오프라인만 캐시 폴백).
// 과거 SWR(cached 먼저 반환)은 공유 기기에서 계정 전환 시 이전 사용자의 노트가
// 그대로 노출되는 문제가 있어 network-first 로 전환. 인증 실패 응답은 캐시를 비운다.
async function swr(req) {
  try {
    const res = await fetch(req);
    // 401/403 = 세션 만료·로그아웃·계정 전환 신호 → 다른 사용자 데이터가 남지
    // 않도록 private 런타임 캐시를 통째로 비운다.
    if (res.status === 401 || res.status === 403) {
      await caches.delete(RUNTIME_CACHE);
      return res;
    }
    if (res.ok) {
      const c = await caches.open(RUNTIME_CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return (
      cached ||
      new Response(JSON.stringify({ offline: true }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

// ───── offline save 큐 (IndexedDB) ─────

const DB_NAME = "vinote-sw";
const STORE = "pending-saves";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueSave(payload) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ payload, at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  for (const it of items) {
    try {
      const res = await fetch(it.payload.url, it.payload.init);
      if (res.ok) {
        await new Promise((resolve) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(it.id);
          tx.oncomplete = resolve;
        });
      }
    } catch {
      // 여전히 offline — 다음 회복 때 재시도
    }
  }
}

async function handleSave(req) {
  try {
    return await fetch(req.clone());
  } catch {
    // offline — 큐에 넣고 클라에 202 응답
    const body = await req.clone().text();
    await enqueueSave({
      url: req.url,
      init: {
        method: "POST",
        headers: Object.fromEntries(req.headers.entries()),
        body,
        credentials: "include",
      },
    });
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// online 회복 시 큐 flush
self.addEventListener("online", () => {
  flushQueue();
});

// 클라이언트가 메시지로 강제 flush 요청
self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_SAVE_QUEUE") {
    event.waitUntil(flushQueue());
  }
  // 로그아웃/계정 전환 시 클라이언트가 호출 — private 노트 캐시 즉시 제거
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});
