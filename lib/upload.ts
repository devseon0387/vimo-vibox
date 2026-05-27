export type UploadHandle = {
  cancel: () => void;
  done: Promise<UploadResult>;
};

export type UploadResult = {
  ok: boolean;
  error?: string;
  saved?: { name: string; size: number; path: string }[];
};

export type UploadStats = {
  /** 샤드 호스트별 진행 중·완료 청크 수 */
  chunksByShard: Record<string, number>;
  /** 관측된 최대 바이트/초 */
  peakBytesPerSec: number;
};

// 청크/동시성 튜닝:
// - 95MB × 18 동시. 메인(vibox.cloud)은 CF Tunnel 경유, u1/u2 는 UPnP 직결(:8443)
//   로 라우팅되어 cloudflared backbone cap 우회 → 사용자 ISP 천장(~50 MB/s) 활용.
// - 청크 95MB: CF Free body 100MB 한계 안전 마진 + TCP slow start 후 큰 window 활용.
// - CORS Max-Age 24h 캐시로 매 청크마다 OPTIONS preflight 안 보냄.
const CHUNK_SIZE = 95 * 1024 * 1024; // 95MB — TCP CC ramp-up 완전 활용
const CONCURRENCY = 24; // 4 origin × 6 origin-conn
const MAX_RETRIES = 4;

// 도메인 샤딩 — 청크 전부 u1/u2 직결로. (vibox.cloud=CF tunnel은 메인 앱 전용)
// 4 origin (u1/u2 × 8443/18443) → 브라우저 6 conn × 4 = 24 TCP, 전부 ISP 직결.
function getShards(): string[] {
  if (typeof window === "undefined") return [""];
  const host = window.location.hostname;
  if (host === "vibox.cloud") {
    return [
      "https://u1.vibox.cloud:8443",
      "https://u2.vibox.cloud:8443",
      "https://u1.vibox.cloud:18443",
      "https://u2.vibox.cloud:18443",
    ];
  }
  return [""];
}

function chunkUrl(fileId: string, index: number): string {
  const shards = getShards();
  const shard = shards[index % shards.length];
  return `${shard}/api/upload/chunk?fileId=${encodeURIComponent(fileId)}&index=${index}`;
}

function shardKey(index: number): string {
  const shards = getShards();
  const shard = shards[index % shards.length];
  if (!shard) return "main";
  try {
    return new URL(shard).hostname.split(".")[0]; // u1, u2
  } catch {
    return "main";
  }
}

function genFileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type ConflictMode = "overwrite" | "autonumber" | "skip";

export type UploadOptions = {
  /** 같은 이름 파일 충돌 시 처리. 기본 'autonumber' (하위호환) */
  conflictMode?: ConflictMode;
};

/**
 * 청크 단위로 업로드. init → chunks(병렬) → complete 3단계.
 * onProgress: (이제까지 업로드한 누적 바이트, 전체 바이트)
 * onStats: 진단용 통계 (샤드 분포, 피크 속도)
 */
export function startUpload(
  targetPath: string,
  files: File[],
  onProgress: (sent: number, total: number) => void,
  onStats?: (stats: UploadStats) => void,
  options?: UploadOptions,
): UploadHandle {
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let sentAcrossFiles = 0;
  const abortController = new AbortController();
  let aborted = false;

  const stats: UploadStats = {
    chunksByShard: {},
    peakBytesPerSec: 0,
  };
  let lastSampleBytes = 0;
  let lastSampleTime = Date.now();

  const reportWithStats = (sent: number) => {
    const now = Date.now();
    const dt = (now - lastSampleTime) / 1000;
    if (dt >= 0.5) {
      const deltaBytes = sent - lastSampleBytes;
      const bps = dt > 0 ? deltaBytes / dt : 0;
      if (bps > stats.peakBytesPerSec) stats.peakBytesPerSec = bps;
      lastSampleBytes = sent;
      lastSampleTime = now;
    }
    onProgress(sent, totalBytes);
    onStats?.(stats);
  };

  const markShard = (index: number) => {
    const key = shardKey(index);
    stats.chunksByShard[key] = (stats.chunksByShard[key] ?? 0) + 1;
    onStats?.(stats);
  };

  const cancel = () => {
    aborted = true;
    abortController.abort();
  };

  const done = (async (): Promise<UploadResult> => {
    const saved: UploadResult["saved"] = [];

    for (const file of files) {
      if (aborted) return { ok: false, error: "aborted" };

      // 폴더 업로드 시 __relPath 가 있으면 그 경로에서 dirname 만 떼어내 targetPath 에 합침
      // 예: __relPath = "myProj/sub/a.mp4" → 실제 업로드 위치 = targetPath + "/myProj/sub"
      const rel = (file as File & { __relPath?: string }).__relPath;
      let perFileTarget = targetPath;
      if (rel) {
        const lastSlash = rel.lastIndexOf("/");
        if (lastSlash > 0) {
          const subDir = rel.slice(0, lastSlash);
          perFileTarget =
            (targetPath.endsWith("/") ? targetPath : targetPath + "/") + subDir;
        }
      }

      const res = await uploadOneFile(
        file,
        perFileTarget,
        (sentInFile) => reportWithStats(sentAcrossFiles + sentInFile),
        markShard,
        abortController.signal,
        options?.conflictMode,
      );

      if (!res.ok) {
        return {
          ok: false,
          error: res.error ?? "unknown",
          saved,
        };
      }
      sentAcrossFiles += file.size;
      saved.push(res.saved!);
      reportWithStats(sentAcrossFiles);
    }

    return { ok: true, saved };
  })();

  return { cancel, done };
}

async function uploadOneFile(
  file: File,
  targetPath: string,
  onFileProgress: (sentInFile: number) => void,
  markShard: (index: number) => void,
  signal: AbortSignal,
  conflictMode?: ConflictMode,
): Promise<{ ok: boolean; error?: string; saved?: { name: string; size: number; path: string } }> {
  const fileId = genFileId();
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  // 1. init
  try {
    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId,
        filename: file.name,
        totalSize: file.size,
        totalChunks,
        path: targetPath,
        conflictMode,
      }),
      signal,
    });
    if (!initRes.ok) {
      const body = await initRes.json().catch(() => ({}));
      return { ok: false, error: "init: " + (body.error ?? initRes.statusText) };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "aborted" };
    return { ok: false, error: "init: " + (e as Error).message };
  }

  // 2. chunks (병렬, CONCURRENCY 만큼 동시)
  const uploadedChunkBytes = new Array(totalChunks).fill(0);
  const reportProgress = () => {
    const sum = uploadedChunkBytes.reduce((a, b) => a + b, 0);
    onFileProgress(sum);
  };

  const queue: number[] = [];
  for (let i = 0; i < totalChunks; i++) queue.push(i);

  const failState: { err: Error | null } = { err: null };

  async function worker() {
    while (queue.length > 0 && !failState.err && !signal.aborted) {
      const i = queue.shift();
      if (i === undefined) break;

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkSize = end - start;

      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (failState.err || signal.aborted) return;
        try {
          const blob = file.slice(start, end);
          uploadedChunkBytes[i] = 0; // 재시도 시 리셋
          if (attempt === 1) markShard(i); // 첫 시도 때만 카운트
          await uploadChunkWithProgress(
            chunkUrl(fileId, i),
            blob,
            (sent) => {
              uploadedChunkBytes[i] = sent;
              reportProgress();
            },
            signal,
          );
          // 완료 확정
          uploadedChunkBytes[i] = chunkSize;
          reportProgress();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if ((e as Error).name === "AbortError") return;
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }
      if (lastErr) {
        failState.err = new Error(
          `chunk ${i} failed: ${(lastErr as Error).message}`,
        );
      }
    }
  }

  const workers: Promise<void>[] = [];
  const parallel = Math.min(CONCURRENCY, totalChunks);
  for (let w = 0; w < parallel; w++) workers.push(worker());
  await Promise.all(workers);

  if (signal.aborted) {
    // abort notification에 fileId 넣어 임시 정리 요청
    await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, action: "abort" }),
    }).catch(() => {});
    return { ok: false, error: "aborted" };
  }

  if (failState.err) {
    await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, action: "abort" }),
    }).catch(() => {});
    return { ok: false, error: failState.err.message };
  }

  // 3. complete
  try {
    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
      signal,
    });
    const body = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      await registerFinalizeRetry(fileId, file.name);
      return { ok: false, error: "complete: " + (body.error ?? completeRes.statusText) };
    }
    return { ok: true, saved: body.saved };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "aborted" };
    // 네트워크 끊김 등 — SW Background Sync 큐에 등록해 자동 재시도
    await registerFinalizeRetry(fileId, file.name);
    return { ok: false, error: "complete: " + (e as Error).message };
  }
}

// chunks 가 모두 올라간 뒤 finalize 가 실패한 경우 IndexedDB 큐에 등록 +
// SW Background Sync 트리거. Chrome 계열만 지원 — 미지원 환경은 no-op.
async function registerFinalizeRetry(fileId: string, filename: string): Promise<void> {
  try {
    const { queueFinalize } = await import("@/lib/idb-pending");
    await queueFinalize(fileId, filename);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const r = reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      if (r.sync) {
        await r.sync.register("vibox-finalize-retry");
      }
    }
  } catch (e) {
    console.warn("[upload] failed to queue finalize retry:", e);
  }
}

/** XHR로 청크 업로드 — 청크 내부 실시간 진행률 제공 */
function uploadChunkWithProgress(
  url: string,
  blob: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    // 크로스-오리진 샤드 도메인에도 세션 쿠키 보냄
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let err = xhr.statusText;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) err = body.error;
        } catch {
          /* keep */
        }
        reject(new Error(`HTTP ${xhr.status}: ${err}`));
      }
    };

    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    };

    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.addEventListener("loadend", () => signal.removeEventListener("abort", onAbort));

    xhr.send(blob);
  });
}
