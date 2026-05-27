// IndexedDB 헬퍼 — 미완료 finalize 큐.
// chunks 자체는 4번 retry + abort 처리. 그러나 모든 chunk 가 올라간 뒤
// /api/upload/complete 가 실패하면 서버에 미완성 chunks 남고 사용자는 다음
// 세션에 수동 재시도해야 함. Background Sync 로 SW 가 자동 재시도.

const DB = "vibox";
const STORE = "pending_finalize";

type PendingFinalize = {
  fileId: string;
  filename: string;
  /** 다음 시도 횟수 — 5회 초과 시 SW 가 큐에서 제거 */
  attempts: number;
  /** 마지막 시도 시각 (epoch ms) */
  lastAttemptAt: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "fileId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const req = fn(s);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueFinalize(fileId: string, filename: string): Promise<void> {
  await tx("readwrite", (s) =>
    s.put({
      fileId,
      filename,
      attempts: 0,
      lastAttemptAt: Date.now(),
    } satisfies PendingFinalize),
  );
}

export async function listPendingFinalize(): Promise<PendingFinalize[]> {
  return (await tx<PendingFinalize[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function removePendingFinalize(fileId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(fileId));
}

export async function bumpPendingFinalize(fileId: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const s = t.objectStore(STORE);
    const get = s.get(fileId);
    get.onsuccess = () => {
      const row = get.result as PendingFinalize | undefined;
      if (!row) return resolve();
      row.attempts += 1;
      row.lastAttemptAt = Date.now();
      const put = s.put(row);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}
