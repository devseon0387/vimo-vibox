import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getStorageRoot } from "@/lib/fs/storage";

const pexec = promisify(exec);

export type SystemSnapshot = {
  timestamp: number;
  remoteHost: string | null; // SSH 원격 모드면 호스트명, 아니면 null
  cpu: {
    usage: number; // 0..1
    cores: number;
    loadAvg: [number, number, number];
    model?: string;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    pressure: number;
  };
  uptimeSec: number;
  disk: { storage: DiskIO | null; system: DiskIO | null };
  network: NetIO | null;
};

type DiskIO = {
  deviceName: string;
  mountPoint?: string;
  readBytesPerSec: number;
  writeBytesPerSec: number;
  tps: number;
};

type NetIO = {
  interfaceName: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
};

// ─────────────────────────────────────────────
// 원격 SSH 실행 래퍼
// SYSTEM_MONITOR_SSH_HOST 환경변수 설정 시 모든 쉘 명령을 SSH로 실행.
// 로컬 dev에서 아이맥 시스템 상태 보기 용도.
// ─────────────────────────────────────────────

function remoteHost(): string | null {
  const host = process.env.SYSTEM_MONITOR_SSH_HOST;
  return host && host.trim() ? host.trim() : null;
}

async function rexec(cmd: string): Promise<string> {
  const host = remoteHost();
  if (host) {
    // 명령어 따옴표 이스케이프
    const safe = cmd.replace(/'/g, `'\\''`);
    const full = `ssh -o ConnectTimeout=3 ${host} '${safe}'`;
    const { stdout } = await pexec(full, { timeout: 5000 });
    return stdout;
  }
  const { stdout } = await pexec(cmd, { timeout: 5000 });
  return stdout;
}

// ─────────────────────────────────────────────
// CPU + Load + Cores
// 로컬: os.cpus() 델타 / 원격: iostat 1 2 의 CPU 컬럼 + sysctl
// ─────────────────────────────────────────────

let lastCpu: ReturnType<typeof os.cpus> | null = null;

async function sampleCpuLocal(): Promise<{
  usage: number;
  cores: number;
  model?: string;
}> {
  const now = os.cpus();
  const cores = now.length;
  let usage = 0;
  if (lastCpu && lastCpu.length === cores) {
    let totalDelta = 0;
    let idleDelta = 0;
    for (let i = 0; i < cores; i++) {
      const a = lastCpu[i].times;
      const b = now[i].times;
      const aTotal = a.user + a.nice + a.sys + a.idle + a.irq;
      const bTotal = b.user + b.nice + b.sys + b.idle + b.irq;
      totalDelta += bTotal - aTotal;
      idleDelta += b.idle - a.idle;
    }
    if (totalDelta > 0) usage = 1 - idleDelta / totalDelta;
  }
  lastCpu = now;
  return {
    usage: Math.max(0, Math.min(1, usage)),
    cores,
    model: now[0]?.model,
  };
}

async function sampleCpuRemote(): Promise<{
  usage: number;
  cores: number;
  model?: string;
}> {
  // sysctl 로 cores + cpu brand
  const [cpuCount, brand] = await Promise.all([
    rexec("sysctl -n hw.ncpu")
      .then((s) => parseInt(s.trim(), 10))
      .catch(() => 0),
    rexec("sysctl -n machdep.cpu.brand_string")
      .then((s) => s.trim())
      .catch(() => ""),
  ]);

  // iostat 로 CPU 사용률 추출 (1초 간격 2회 sample, 2번째 줄 = 순간값)
  let usage = 0;
  try {
    const out = await rexec("iostat -w 1 -c 2 2>/dev/null");
    // 맨 마지막 줄에서 id(idle) 퍼센트 추출
    const lines = out.trim().split("\n");
    const last = lines[lines.length - 1].trim();
    const cols = last.split(/\s+/).map((s) => parseFloat(s));
    // iostat 컬럼 레이아웃: disk.KB/t disk.tps disk.MB/s ... us sy id  loadavg(1m 5m 15m)
    // id 는 뒤에서 4번째 (loadavg 3개 포함)
    // 더 안전: 마지막 6개 중 3번째가 id
    const idleIdx = cols.length - 4;
    if (idleIdx > 0 && Number.isFinite(cols[idleIdx])) {
      usage = Math.max(0, Math.min(1, 1 - cols[idleIdx] / 100));
    }
  } catch {}

  return {
    usage,
    cores: cpuCount || 1,
    model: brand || undefined,
  };
}

// ─────────────────────────────────────────────
// Load average
// ─────────────────────────────────────────────

async function sampleLoadAvg(): Promise<[number, number, number]> {
  if (!remoteHost()) {
    return os.loadavg() as [number, number, number];
  }
  try {
    const out = await rexec("sysctl -n vm.loadavg");
    // "{ 1.23 1.45 1.10 }"
    const m = out.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) {
      return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
    }
  } catch {}
  return [0, 0, 0];
}

// ─────────────────────────────────────────────
// Memory
// ─────────────────────────────────────────────

async function sampleMemory(): Promise<SystemSnapshot["memory"]> {
  if (!remoteHost()) {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      pressure: total > 0 ? used / total : 0,
    };
  }
  // 원격: sysctl + vm_stat
  try {
    const [totalStr, vmstatOut] = await Promise.all([
      rexec("sysctl -n hw.memsize"),
      rexec("vm_stat"),
    ]);
    const total = parseInt(totalStr.trim(), 10) || 0;
    // Pages free + Pages speculative 를 free 취급
    // page size 는 vm_stat 첫 줄에서 추출
    const pageSizeMatch = vmstatOut.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;
    const getPages = (label: string): number => {
      const re = new RegExp(`${label}:\\s+([\\d]+)\\.`);
      const m = vmstatOut.match(re);
      return m ? parseInt(m[1], 10) : 0;
    };
    const freePages = getPages("Pages free") + getPages("Pages speculative");
    const free = freePages * pageSize;
    const used = Math.max(0, total - free);
    return {
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      pressure: total > 0 ? used / total : 0,
    };
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0, pressure: 0 };
  }
}

// ─────────────────────────────────────────────
// Uptime
// ─────────────────────────────────────────────

async function sampleUptime(): Promise<number> {
  if (!remoteHost()) return os.uptime();
  try {
    const out = await rexec("sysctl -n kern.boottime");
    // "{ sec = 1234567, usec = 890 } Mon Jan ..."
    const m = out.match(/sec\s*=\s*(\d+)/);
    if (m) {
      const boot = parseInt(m[1], 10);
      return Math.max(0, Math.floor(Date.now() / 1000) - boot);
    }
  } catch {}
  return 0;
}

// ─────────────────────────────────────────────
// Disk devices (cached)
// ─────────────────────────────────────────────

function toWholeDisk(devId: string): string {
  const m = devId.match(/^(disk\d+)/);
  return m ? m[1] : devId;
}

// APFS 합성 디스크(diskN)는 iostat에서 모니터 불가 → 실제 물리 디스크(APFSPhysicalStore)로 매핑
function extractDeviceIdFromPlist(plistXml: string): string | null {
  const physicalMatch = plistXml.match(
    /<key>APFSPhysicalStore<\/key>\s*<string>([^<]+)<\/string>/,
  );
  if (physicalMatch) return toWholeDisk(physicalMatch[1]);
  const devMatch = plistXml.match(
    /<key>DeviceIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
  );
  if (devMatch) return toWholeDisk(devMatch[1]);
  return null;
}

let cachedDevices: {
  storage: string | null;
  system: string | null;
  storageMount?: string;
} | null = null;

async function getDiskDevices(): Promise<{
  storage: string | null;
  system: string | null;
  storageMount?: string;
}> {
  if (cachedDevices) return cachedDevices;

  let storage: string | null = null;
  let system: string | null = null;
  let storageMount: string | undefined;

  // 원격 모드일 땐 아이맥의 STORAGE_ROOT 를 따로 알 수 없어서
  // vibox 설정상 보통 /Volumes/Vibox Storage A 를 씀. 환경변수로 덮어쓰기 가능.
  const storagePath =
    process.env.SYSTEM_MONITOR_STORAGE_PATH ||
    (remoteHost() ? "/Volumes/Vibox Storage A" : getStorageRoot());

  try {
    const out = await rexec(`diskutil info -plist "${storagePath}"`);
    const dev = extractDeviceIdFromPlist(out);
    if (dev) {
      storage = dev;
      storageMount = storagePath;
    }
  } catch {}

  try {
    const out = await rexec(`diskutil info -plist /`);
    const dev = extractDeviceIdFromPlist(out);
    if (dev) system = dev;
  } catch {}

  cachedDevices = { storage, system, storageMount };
  return cachedDevices;
}

// ─────────────────────────────────────────────
// Disk I/O
// ─────────────────────────────────────────────

type IostatSnap = {
  kbRead: number;
  kbWritten: number;
  tps: number;
  at: number;
};
const iostatPrev: Record<string, IostatSnap> = {};

async function readIostatCumulative(
  devices: string[],
): Promise<Record<string, { kbRead: number; kbWritten: number; tps: number }>> {
  const result: Record<string, { kbRead: number; kbWritten: number; tps: number }> = {};
  if (devices.length === 0) return result;
  const cmd = `iostat -I -d ${devices.map((d) => `"${d}"`).join(" ")}`;
  try {
    const stdout = await rexec(cmd);
    const lines = stdout.trim().split("\n");
    if (lines.length < 3) return result;
    const dataLine = lines[lines.length - 1].trim().split(/\s+/);
    for (let i = 0; i < devices.length; i++) {
      const offset = i * 3;
      const xfrs = parseFloat(dataLine[offset + 1] ?? "0");
      const mb = parseFloat(dataLine[offset + 2] ?? "0");
      const kbTotal = mb * 1024;
      result[devices[i]] = { kbRead: kbTotal, kbWritten: 0, tps: xfrs };
    }
  } catch {}
  return result;
}

async function sampleDisk(): Promise<SystemSnapshot["disk"]> {
  const { storage, system, storageMount } = await getDiskDevices();
  const devices = [storage, system].filter((d): d is string => !!d);
  if (devices.length === 0) return { storage: null, system: null };

  const cumulative = await readIostatCumulative(devices);
  const now = Date.now();

  const buildDiskIO = (
    deviceName: string | null,
    mountPoint?: string,
  ): DiskIO | null => {
    if (!deviceName) return null;
    const cur = cumulative[deviceName];
    if (!cur) return null;
    const prev = iostatPrev[deviceName];
    iostatPrev[deviceName] = { ...cur, at: now };
    if (!prev) {
      return {
        deviceName,
        mountPoint,
        readBytesPerSec: 0,
        writeBytesPerSec: 0,
        tps: 0,
      };
    }
    const dt = (now - prev.at) / 1000;
    if (dt <= 0) {
      return {
        deviceName,
        mountPoint,
        readBytesPerSec: 0,
        writeBytesPerSec: 0,
        tps: 0,
      };
    }
    const readBps = ((cur.kbRead - prev.kbRead) * 1024) / dt;
    const writeBps = ((cur.kbWritten - prev.kbWritten) * 1024) / dt;
    return {
      deviceName,
      mountPoint,
      readBytesPerSec: Math.max(0, readBps),
      writeBytesPerSec: Math.max(0, writeBps),
      tps: Math.max(0, (cur.tps - prev.tps) / dt),
    };
  };

  return {
    storage: buildDiskIO(storage, storageMount),
    system: buildDiskIO(system, "/"),
  };
}

// ─────────────────────────────────────────────
// Network I/O
// ─────────────────────────────────────────────

type NetSnap = { rx: number; tx: number; at: number };
const netPrev: Record<string, NetSnap> = {};

async function sampleNet(): Promise<NetIO | null> {
  try {
    const stdout = await rexec("netstat -ibn");
    const lines = stdout.trim().split("\n").slice(1);
    const now = Date.now();
    const seen = new Set<string>();
    let best: { iface: string; total: number; rx: number; tx: number } | null =
      null;
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      const iface = cols[0];
      if (!iface || iface.startsWith("lo") || seen.has(iface)) continue;
      const ibytes = parseInt(cols[6] ?? "0", 10);
      const obytes = parseInt(cols[9] ?? "0", 10);
      if (!Number.isFinite(ibytes) || !Number.isFinite(obytes)) continue;
      seen.add(iface);
      const total = ibytes + obytes;
      if (!best || total > best.total) {
        best = { iface, total, rx: ibytes, tx: obytes };
      }
    }
    if (!best) return null;
    const prev = netPrev[best.iface];
    netPrev[best.iface] = { rx: best.rx, tx: best.tx, at: now };
    if (!prev) {
      return {
        interfaceName: best.iface,
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
      };
    }
    const dt = (now - prev.at) / 1000;
    if (dt <= 0) {
      return {
        interfaceName: best.iface,
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
      };
    }
    return {
      interfaceName: best.iface,
      rxBytesPerSec: Math.max(0, (best.rx - prev.rx) / dt),
      txBytesPerSec: Math.max(0, (best.tx - prev.tx) / dt),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const host = remoteHost();
  const [cpu, loadAvg, memory, uptimeSec, disk, net] = await Promise.all([
    host ? sampleCpuRemote() : sampleCpuLocal(),
    sampleLoadAvg(),
    sampleMemory(),
    sampleUptime(),
    sampleDisk(),
    sampleNet(),
  ]);
  return {
    timestamp: Date.now(),
    remoteHost: host,
    cpu: {
      usage: cpu.usage,
      cores: cpu.cores,
      loadAvg,
      model: cpu.model,
    },
    memory,
    uptimeSec,
    disk,
    network: net,
  };
}
