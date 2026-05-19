import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type BackupStatus = {
  litestreamRunning: boolean;
  litestreamPid: number | null;
  litestreamUptimeSec: number | null;
  replicaPath: string | null;
  replicaExists: boolean;
  lastSyncMs: number | null;
  replicaSizeBytes: number;
  ageWarning: boolean;
};

// 환경변수로 override 가능. 운영 환경에서 디스크 이전 / 경로 변경 시 .env.local 수정.
// 기본값: Mac mini 운영 환경 (Litestream 0.5, vibox-vault 심볼릭 링크 경유)
const REPLICA_PATH =
  process.env.LITESTREAM_REPLICA_PATH ??
  "/Users/vimo_server/vibox-vault/litestream-macmini";
const STALE_THRESHOLD_MS = 5 * 60_000; // 5분 이상 정지면 경고

async function getLitestreamProcess(): Promise<{ pid: number; uptimeSec: number } | null> {
  try {
    // 정확한 매칭: 실행 중인 'litestream replicate' 프로세스만
    const { stdout: pidOut } = await execAsync(
      "/usr/bin/pgrep -f 'litestream replicate' | head -1",
      { timeout: 3000 },
    );
    const pid = parseInt(pidOut.trim(), 10);
    if (!Number.isFinite(pid)) return null;

    // uptime 별도 조회 (macOS pgrep은 etime 출력 X)
    const { stdout: etimeOut } = await execAsync(
      `ps -o etime= -p ${pid}`,
      { timeout: 3000 },
    );
    const uptimeSec = parseEtime(etimeOut.trim());
    return { pid, uptimeSec };
  } catch {
    return null;
  }
}

function parseEtime(etime: string): number {
  // formats: MM:SS, HH:MM:SS, DD-HH:MM:SS
  const parts = etime.split("-");
  let days = 0;
  let rest = etime;
  if (parts.length === 2) {
    days = parseInt(parts[0], 10);
    rest = parts[1];
  }
  const tp = rest.split(":").map((s) => parseInt(s, 10));
  let h = 0, m = 0, s = 0;
  if (tp.length === 3) [h, m, s] = tp;
  else if (tp.length === 2) [m, s] = tp;
  else s = tp[0] ?? 0;
  return days * 86400 + h * 3600 + m * 60 + s;
}

async function dirSize(absRoot: string): Promise<{ bytes: number; lastMtime: number }> {
  let bytes = 0;
  let lastMtime = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else {
        try {
          const s = await fs.stat(abs);
          bytes += s.size;
          if (s.mtimeMs > lastMtime) lastMtime = s.mtimeMs;
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(absRoot);
  return { bytes, lastMtime };
}

let cache: { data: BackupStatus; ts: number } | null = null;
const CACHE_TTL = 7000;

export async function getBackupStatus(opts: { force?: boolean } = {}): Promise<BackupStatus> {
  if (!opts.force && cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const proc = await getLitestreamProcess();
  let replicaExists = false;
  let replicaSizeBytes = 0;
  let lastSyncMs: number | null = null;
  try {
    await fs.access(REPLICA_PATH);
    replicaExists = true;
    const { bytes, lastMtime } = await dirSize(REPLICA_PATH);
    replicaSizeBytes = bytes;
    lastSyncMs = lastMtime || null;
  } catch {
    /* replica not mounted */
  }

  const ageWarning =
    replicaExists && lastSyncMs !== null && Date.now() - lastSyncMs > STALE_THRESHOLD_MS;

  const data: BackupStatus = {
    litestreamRunning: !!proc,
    litestreamPid: proc?.pid ?? null,
    litestreamUptimeSec: proc?.uptimeSec ?? null,
    replicaPath: REPLICA_PATH,
    replicaExists,
    lastSyncMs,
    replicaSizeBytes,
    ageWarning,
  };
  cache = { data, ts: Date.now() };
  return data;
}
