import { exec } from "node:child_process";
import { promisify } from "node:util";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { encodingJobs, hlsAssets } from "@/lib/db/schema";

const pexec = promisify(exec);

export type HealthSnapshot = {
  timestamp: number;
  remoteHost: string | null;
  swap: SwapUsage | null;
  memoryPressure: MemoryPressure | null;
  ping: PingResult | null;
  pm2: Pm2Process[];
  litestream: LitestreamStatus;
  smart: SmartInfo[];
  volumes: VolumeUsage[];
  mirror: MirrorStatus | null;
  encoding: EncodingQueueInfo;
};

export type EncodingQueueInfo = {
  active: { id: string; filePath: string; progress: number; startedAt: number | null }[];
  queuedCount: number;
  doneCount: number;
  failedCount: number;
  totalAssets: number;
  totalAssetBytes: number;
  recentFailed: { id: string; filePath: string; error: string | null; finishedAt: number | null }[];
};

export type VolumeUsage = {
  tier: "hot" | "warm" | "cold";
  label: string; // "Vibox Storage A" 등
  mountPath: string;
  mounted: boolean;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
};

export type MirrorStatus = {
  launchdLoaded: boolean;
  latestDate: string | null; // "2026-04-23"
  latestAt: number | null; // 에폭 ms
  snapshotCount: number;
  totalBytes: number;
  lastLogTail: string | null; // 최신 로그의 마지막 줄 (오늘 분)
};

type SwapUsage = {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  encrypted: boolean;
};

type MemoryPressure = {
  kernelTaskCpuPct: number | null; // 열 쓰로틀링 지표
  compressedBytes: number | null;
  swapped: boolean;
};

type PingResult = {
  host: string;
  avgMs: number;
  loss: number; // 0..1
  ok: boolean;
};

type Pm2Process = {
  name: string;
  status: string; // online | errored | stopped
  pid: number;
  restartCount: number;
  uptimeSec: number;
  memoryBytes: number;
  cpu: number;
};

type LitestreamStatus = {
  launchdLoaded: boolean;
  processAlive: boolean;
  lastBackupAt: number | null;
  backupSizeBytes: number | null;
};

type SmartInfo = {
  modelName: string;
  serial: string;
  capacityBytes: number;
  usbSpeed: string; // "Up to 5 Gb/s" 등
  status: "Verified" | "Failing" | "Not Supported" | "Unknown" | "Disconnected";
  tier: "hot" | "warm" | "cold";
  volumeLabel: string; // "Vibox Storage A" 등
  connected: boolean;
};

// 알려진 외장 드라이브 매핑 — 포맷/연결 순서 바뀌어도 매칭 유지
const KNOWN_DRIVES: Array<{
  marker: string;
  tier: "hot" | "warm" | "cold";
  label: string;
  model: string;
}> = [
  { marker: "PSSD T5 EVO",      tier: "hot",  label: "Vibox Storage A", model: "Samsung T5 EVO 8TB" },
  { marker: "My Passport 25E4", tier: "warm", label: "Vibox Mirror",    model: "WD My Passport 4TB" },
  { marker: "Elements 2621",    tier: "cold", label: "Vibox Vault",     model: "WD Elements 4TB" },
];

// ─────────────────────────────────────────────
// 원격 실행 래퍼 (system-monitor.ts 와 동일 패턴)
// ─────────────────────────────────────────────

function remoteHost(): string | null {
  const host = process.env.SYSTEM_MONITOR_SSH_HOST;
  return host && host.trim() ? host.trim() : null;
}

async function rexec(cmd: string, timeoutMs = 10_000): Promise<string> {
  const host = remoteHost();
  // sysctl, ping, system_profiler 는 /usr/sbin, /sbin 에 있음
  const env =
    "export PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin;";
  const full = host
    ? `ssh -o ConnectTimeout=3 ${host} '${(env + cmd).replace(/'/g, `'\\''`)}'`
    : env + cmd;
  const { stdout } = await pexec(full, { timeout: timeoutMs });
  return stdout;
}

// ─────────────────────────────────────────────
// Swap
// ─────────────────────────────────────────────

async function getSwap(): Promise<SwapUsage | null> {
  try {
    const out = await rexec("sysctl vm.swapusage");
    // vm.swapusage: total = 1024.00M  used = 269.00M  free = 755.00M  (encrypted)
    const m = out.match(
      /total\s*=\s*([\d.]+)([KMGT])\s+used\s*=\s*([\d.]+)([KMGT])\s+free\s*=\s*([\d.]+)([KMGT])/,
    );
    if (!m) return null;
    const factor = (unit: string): number => {
      switch (unit) {
        case "K":
          return 1024;
        case "M":
          return 1024 ** 2;
        case "G":
          return 1024 ** 3;
        case "T":
          return 1024 ** 4;
        default:
          return 1;
      }
    };
    return {
      totalBytes: parseFloat(m[1]) * factor(m[2]),
      usedBytes: parseFloat(m[3]) * factor(m[4]),
      freeBytes: parseFloat(m[5]) * factor(m[6]),
      encrypted: /encrypted/.test(out),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Memory pressure (kernel_task CPU)
// ─────────────────────────────────────────────

async function getMemoryPressure(): Promise<MemoryPressure | null> {
  try {
    // top 에서 kernel_task CPU% 추출 (열 쓰로틀링 지표)
    const out = await rexec("ps -A -o pid,pcpu,comm | grep -m 1 kernel_task || true");
    // "    0  12.3 /System/Library/Kernels/kernel"
    let kernelTaskCpu: number | null = null;
    const m = out.trim().match(/^\s*\d+\s+([\d.]+)/);
    if (m) kernelTaskCpu = parseFloat(m[1]);

    // swap 사용 중이면 swapped = true
    const swap = await getSwap();
    return {
      kernelTaskCpuPct: kernelTaskCpu,
      compressedBytes: null, // vm_stat 에서 추출 가능하지만 스왑 플래그로 충분
      swapped: (swap?.usedBytes ?? 0) > 0,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Ping
// ─────────────────────────────────────────────

async function getPing(host = "1.1.1.1"): Promise<PingResult | null> {
  try {
    const out = await rexec(`ping -c 3 -t 2 ${host}`);
    // "round-trip min/avg/max/stddev = 5.172/5.174/5.176/0.002 ms"
    const avgMatch = out.match(/min\/avg\/max\/[\w]+ = [\d.]+\/([\d.]+)\//);
    // "3 packets transmitted, 3 packets received, 0.0% packet loss"
    const lossMatch = out.match(/([\d.]+)% packet loss/);
    const avgMs = avgMatch ? parseFloat(avgMatch[1]) : 0;
    const loss = lossMatch ? parseFloat(lossMatch[1]) / 100 : 1;
    return {
      host,
      avgMs,
      loss,
      ok: avgMs > 0 && loss < 0.5,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// PM2 processes
// ─────────────────────────────────────────────

async function getPm2Processes(): Promise<Pm2Process[]> {
  try {
    const out = await rexec("pm2 jlist");
    const arr = JSON.parse(out) as Array<{
      name: string;
      pid: number;
      pm2_env: {
        status: string;
        restart_time: number;
        pm_uptime: number;
      };
      monit: { memory: number; cpu: number };
    }>;
    const now = Date.now();
    return arr.map((p) => ({
      name: p.name,
      status: p.pm2_env.status,
      pid: p.pid,
      restartCount: p.pm2_env.restart_time,
      uptimeSec: Math.max(
        0,
        Math.floor((now - (p.pm2_env.pm_uptime || now)) / 1000),
      ),
      memoryBytes: p.monit?.memory ?? 0,
      cpu: p.monit?.cpu ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Litestream status
// ─────────────────────────────────────────────

async function getLitestreamStatus(): Promise<LitestreamStatus> {
  const result: LitestreamStatus = {
    launchdLoaded: false,
    processAlive: false,
    lastBackupAt: null,
    backupSizeBytes: null,
  };

  try {
    const out = await rexec("launchctl list 2>/dev/null | grep vibox.litestream || true");
    result.launchdLoaded = out.includes("vibox.litestream");
  } catch {}

  try {
    const out = await rexec("pgrep -f 'litestream replicate' || true");
    result.processAlive = out.trim().length > 0;
  } catch {}

  try {
    const backupPath = "/Volumes/Vibox Vault/litestream";
    const [latest, size] = await Promise.all([
      rexec(
        `find "${backupPath}" -type f -name '*.ltx' -print0 | xargs -0 stat -f '%m' 2>/dev/null | sort -rn | head -1 || true`,
      ),
      rexec(`du -sk "${backupPath}" 2>/dev/null | awk '{print $1}' || true`),
    ]);
    const ts = parseInt(latest.trim(), 10);
    if (!Number.isNaN(ts) && ts > 0) result.lastBackupAt = ts * 1000;
    const kb = parseInt(size.trim(), 10);
    if (!Number.isNaN(kb)) result.backupSizeBytes = kb * 1024;
  } catch {}

  return result;
}

// ─────────────────────────────────────────────
// SMART (system_profiler SPUSBDataType) — 외장 SSD
// ─────────────────────────────────────────────

async function getSmartInfoAll(): Promise<SmartInfo[]> {
  try {
    const out = await rexec("system_profiler SPUSBDataType", 15_000);
    const result: SmartInfo[] = [];

    for (const drv of KNOWN_DRIVES) {
      const idx = out.indexOf(drv.marker);
      if (idx === -1) {
        // 드라이브 연결 안 됨
        result.push({
          modelName: drv.model,
          serial: "",
          capacityBytes: 0,
          usbSpeed: "",
          status: "Disconnected",
          tier: drv.tier,
          volumeLabel: drv.label,
          connected: false,
        });
        continue;
      }
      // marker 위치부터 다음 드라이브 마커 또는 2500자까지 블록
      const nextMarkerIdx = KNOWN_DRIVES
        .filter((d) => d.marker !== drv.marker)
        .map((d) => out.indexOf(d.marker, idx + drv.marker.length))
        .filter((i) => i > idx)
        .reduce((a, b) => Math.min(a, b), idx + 2500);
      const block = out.substring(idx, Math.min(nextMarkerIdx, idx + 2500));

      const capMatch = block.match(
        /Capacity:\s+[\d.]+\s+[KMGT]B\s+\(([\d,]+)\s+bytes/,
      );
      const serialMatch = block.match(/Serial Number:\s+(\S+)/);
      const speedMatch = block.match(/Speed:\s+([^\n]+)/);
      const smartMatch = block.match(/S\.M\.A\.R\.T\.\s+status:\s+(\w+)/);

      let status: SmartInfo["status"] = "Unknown";
      if (smartMatch) {
        const raw = smartMatch[1];
        if (raw === "Verified") status = "Verified";
        else if (/fail/i.test(raw)) status = "Failing";
        else status = "Not Supported";
      }

      result.push({
        modelName: drv.model,
        serial: serialMatch?.[1] ?? "",
        capacityBytes: capMatch ? parseInt(capMatch[1].replace(/,/g, ""), 10) : 0,
        usbSpeed: speedMatch?.[1]?.trim() ?? "",
        status,
        tier: drv.tier,
        volumeLabel: drv.label,
        connected: true,
      });
    }

    return result;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Volume usage (df)
// ─────────────────────────────────────────────

async function getVolumeUsage(
  tier: VolumeUsage["tier"],
  label: string,
  mountPath: string,
): Promise<VolumeUsage> {
  // df -k 출력: Filesystem 1024-blocks Used Available Capacity ... Mounted on
  const base = { tier, label, mountPath };
  try {
    const out = await rexec(`df -k "${mountPath}" 2>/dev/null || true`);
    // 두 번째 줄이 데이터. 줄 바꿈 대응
    const lines = out.trim().split("\n");
    if (lines.length < 2) {
      return { ...base, mounted: false, totalBytes: 0, usedBytes: 0, freeBytes: 0 };
    }
    // 공백 여러 개로 split, 마운트 경로는 맨 마지막
    const cols = lines[1].split(/\s+/);
    if (cols.length < 4) {
      return { ...base, mounted: false, totalBytes: 0, usedBytes: 0, freeBytes: 0 };
    }
    const totalKb = parseInt(cols[1], 10);
    const usedKb = parseInt(cols[2], 10);
    const freeKb = parseInt(cols[3], 10);
    if ([totalKb, usedKb, freeKb].some((n) => Number.isNaN(n))) {
      return { ...base, mounted: false, totalBytes: 0, usedBytes: 0, freeBytes: 0 };
    }
    return {
      ...base,
      mounted: true,
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      freeBytes: freeKb * 1024,
    };
  } catch {
    return { ...base, mounted: false, totalBytes: 0, usedBytes: 0, freeBytes: 0 };
  }
}

async function getAllVolumes(): Promise<VolumeUsage[]> {
  return Promise.all([
    getVolumeUsage("hot", "Vibox Storage A", "/Volumes/Vibox Storage A"),
    getVolumeUsage("warm", "Vibox Mirror", "/Volumes/Vibox Mirror"),
    getVolumeUsage("cold", "Vibox Vault", "/Volumes/Vibox Vault"),
  ]);
}

// ─────────────────────────────────────────────
// Mirror status (Vibox Mirror/daily/*)
// ─────────────────────────────────────────────

async function getMirrorStatus(): Promise<MirrorStatus | null> {
  try {
    const root = "/Volumes/Vibox Mirror/daily";
    // 마운트 확인
    const mounted = await rexec(`test -d "${root}" && echo y || true`);
    if (mounted.trim() !== "y") return null;

    // launchd 등록 상태
    let launchdLoaded = false;
    try {
      const out = await rexec(
        "launchctl list 2>/dev/null | grep com.vibox.mirror || true",
      );
      launchdLoaded = out.includes("com.vibox.mirror");
    } catch {}

    // latest 심볼릭 → 날짜 추출
    let latestDate: string | null = null;
    try {
      const out = await rexec(`readlink "${root}/latest" 2>/dev/null || true`);
      const v = out.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) latestDate = v;
    } catch {}

    // 스냅샷 개수 + latest mtime
    let snapshotCount = 0;
    let latestAt: number | null = null;
    try {
      const out = await rexec(
        `ls -1 "${root}" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || true`,
      );
      const names = out.trim().split("\n").filter(Boolean);
      snapshotCount = names.length;
      if (latestDate) {
        const mt = await rexec(
          `stat -f '%m' "${root}/${latestDate}" 2>/dev/null || true`,
        );
        const ts = parseInt(mt.trim(), 10);
        if (!Number.isNaN(ts) && ts > 0) latestAt = ts * 1000;
      }
    } catch {}

    // 전체 crate 크기 (hardlink 이용해 실제 점유 용량만)
    let totalBytes = 0;
    try {
      const out = await rexec(`du -sk "${root}" 2>/dev/null | awk '{print $1}' || true`);
      const kb = parseInt(out.trim(), 10);
      if (!Number.isNaN(kb)) totalBytes = kb * 1024;
    } catch {}

    // 오늘 로그 tail 한 줄
    let lastLogTail: string | null = null;
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC지만 KST 영향 크지 않음)
      const out = await rexec(
        `tail -n 1 "/Volumes/Vibox Mirror/logs/${today}.log" 2>/dev/null || true`,
      );
      const v = out.trim();
      if (v) lastLogTail = v;
    } catch {}

    return {
      launchdLoaded,
      latestDate,
      latestAt,
      snapshotCount,
      totalBytes,
      lastLogTail,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 집계 (일부 캐시 적용)
// ─────────────────────────────────────────────

const CACHE_SMART_MS = 5 * 60 * 1000; // SMART 는 무거움 5분 캐시
let smartCache: { at: number; data: SmartInfo[] } | null = null;

async function getEncodingQueueInfo(): Promise<EncodingQueueInfo> {
  const [active, queuedRows, doneRows, failedRows, recentFailed, assetAgg] =
    await Promise.all([
      db
        .select()
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "running")),
      db
        .select({ id: encodingJobs.id })
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "queued")),
      db
        .select({ id: encodingJobs.id })
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "done")),
      db
        .select({ id: encodingJobs.id })
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "failed")),
      db
        .select()
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "failed"))
        .orderBy(desc(encodingJobs.finishedAt))
        .limit(5),
      db.select().from(hlsAssets),
    ]);
  const totalAssetBytes = assetAgg.reduce(
    (acc, a) => acc + (a.totalBytes ?? 0),
    0,
  );
  return {
    active: active.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      progress: r.progress,
      startedAt: r.startedAt ? r.startedAt.getTime() : null,
    })),
    queuedCount: queuedRows.length,
    doneCount: doneRows.length,
    failedCount: failedRows.length,
    totalAssets: assetAgg.length,
    totalAssetBytes,
    recentFailed: recentFailed.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      error: r.error,
      finishedAt: r.finishedAt ? r.finishedAt.getTime() : null,
    })),
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const now = Date.now();

  const [swap, memoryPressure, ping, pm2, litestream, volumes, mirror, encoding] =
    await Promise.all([
      getSwap(),
      getMemoryPressure(),
      getPing(),
      getPm2Processes(),
      getLitestreamStatus(),
      getAllVolumes(),
      getMirrorStatus(),
      getEncodingQueueInfo(),
    ]);

  // SMART 캐시
  let smart: SmartInfo[];
  if (smartCache && now - smartCache.at < CACHE_SMART_MS) {
    smart = smartCache.data;
  } else {
    smart = await getSmartInfoAll();
    smartCache = { at: now, data: smart };
  }

  return {
    timestamp: now,
    remoteHost: remoteHost(),
    swap,
    memoryPressure,
    ping,
    pm2,
    litestream,
    smart,
    volumes,
    mirror,
    encoding,
  };
}
