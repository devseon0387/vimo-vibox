import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getZoneRoot, type Zone } from "@/lib/fs/storage";

const execAsync = promisify(exec);

export type ZoneTag = Zone;

export type DiskVolume = {
  name: string;
  mountPath: string;
  fsType: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  topEntries: { name: string; isDir: boolean; size?: number; mtime?: number; zone?: ZoneTag }[];
  zones: ZoneTag[];
  managed: boolean; // contains at least one Vibox zone
};

export type FolderEntry = {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
};

export type FolderListing = {
  path: string;
  zone: ZoneTag;
  parent: string | null;
  entries: FolderEntry[];
};

let cache: { data: DiskVolume[]; ts: number } | null = null;
const CACHE_TTL = 7000;

const ZONES: ZoneTag[] = ["rendering", "library", "personal", "notes"];

function tryGetZoneRoot(z: ZoneTag): string | null {
  try {
    return getZoneRoot(z);
  } catch {
    return null;
  }
}

function getAllZoneRoots(): { zone: ZoneTag; root: string }[] {
  const out: { zone: ZoneTag; root: string }[] = [];
  for (const z of ZONES) {
    const r = tryGetZoneRoot(z);
    if (r) out.push({ zone: z, root: r });
  }
  return out;
}

async function getMountInfo(): Promise<Map<string, string>> {
  // map: mountPath -> fsType
  const out = new Map<string, string>();
  try {
    const { stdout } = await execAsync("/sbin/mount", { timeout: 3000 });
    for (const line of stdout.split("\n")) {
      const m = line.match(/^(\S+) on (.+) \(([^,]+)/);
      if (!m) continue;
      out.set(m[2], m[3]);
    }
  } catch {
    // mount not available; leave empty
  }
  return out;
}

export async function listVolumes(opts: { force?: boolean } = {}): Promise<DiskVolume[]> {
  if (!opts.force && cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const zoneRoots = getAllZoneRoots();
  const mounts = await getMountInfo();
  const volumesDir = "/Volumes";

  let entries: { name: string; mountPath: string }[] = [];
  try {
    const dirents = await fs.readdir(volumesDir, { withFileTypes: true });
    for (const d of dirents) {
      // both directories and symlinks (Macintosh HD is a symlink)
      if (d.isDirectory() || d.isSymbolicLink()) {
        entries.push({ name: d.name, mountPath: path.join(volumesDir, d.name) });
      }
    }
  } catch {
    // /Volumes 읽기 실패 (예: Linux 환경) — STORAGE_ROOT 직접 가리키는 fallback
    const r = tryGetZoneRoot("rendering");
    if (r) {
      // STORAGE_ROOT의 부모를 단일 "volume"으로 취급
      const parent = path.dirname(r);
      entries = [{ name: path.basename(parent) || "root", mountPath: parent }];
    }
  }

  // 시스템 디렉토리 제외 (Recovery 등은 마운트 안 돼있을 수 있음)
  entries = entries.filter((e) => !e.name.startsWith("."));

  const out: DiskVolume[] = [];
  for (const e of entries) {
    try {
      const stat = await fs.statfs(e.mountPath);
      const top = await fs.readdir(e.mountPath, { withFileTypes: true });
      const visible = top.filter((d) => !d.name.startsWith(".") && !d.name.startsWith("$"));

      const topEntries: DiskVolume["topEntries"] = [];
      for (const d of visible) {
        const isDir = d.isDirectory();
        const abs = path.join(e.mountPath, d.name);
        let size: number | undefined;
        let mtime: number | undefined;
        try {
          const s = await fs.stat(abs);
          size = s.size;
          mtime = s.mtimeMs;
        } catch {
          /* skip */
        }
        const matchedZone = zoneRoots.find((z) => z.root === abs)?.zone;
        topEntries.push({ name: d.name, isDir, size, mtime, zone: matchedZone });
      }

      // 어떤 zone들이 이 볼륨에 있는지 (top-level 매칭만)
      const zones = topEntries.map((t) => t.zone).filter((z): z is ZoneTag => Boolean(z));

      out.push({
        name: e.name,
        mountPath: e.mountPath,
        fsType: mounts.get(e.mountPath) ?? "unknown",
        totalBytes: stat.blocks * stat.bsize,
        usedBytes: (stat.blocks - stat.bfree) * stat.bsize,
        freeBytes: stat.bavail * stat.bsize,
        topEntries: topEntries.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
        zones,
        managed: zones.length > 0,
      });
    } catch {
      // 접근 불가 볼륨 (BOOTCAMP write protected 등) — 메타만 노출
      out.push({
        name: e.name,
        mountPath: e.mountPath,
        fsType: mounts.get(e.mountPath) ?? "unknown",
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        topEntries: [],
        zones: [],
        managed: false,
      });
    }
  }

  // 정렬: managed 먼저, 그 다음 이름순
  out.sort((a, b) => {
    if (a.managed !== b.managed) return a.managed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  cache = { data: out, ts: Date.now() };
  return out;
}

/**
 * absPath가 어떤 Vibox zone 안에 있는지 확인. zone 안이면 zone 반환, 밖이면 null.
 * zone 자체(root)도 허용.
 */
function zoneOf(absPath: string): ZoneTag | null {
  for (const { zone, root } of getAllZoneRoots()) {
    if (absPath === root || absPath.startsWith(root + path.sep)) {
      return zone;
    }
  }
  return null;
}

export async function browseUnderZone(absPath: string): Promise<FolderListing> {
  const normalized = path.resolve(absPath);
  const zone = zoneOf(normalized);
  if (!zone) {
    throw new Error("이 경로는 비박스가 관리하는 zone 안에 있지 않습니다");
  }
  const stat = await fs.stat(normalized);
  if (!stat.isDirectory()) {
    throw new Error("폴더가 아닙니다");
  }
  const dirents = await fs.readdir(normalized, { withFileTypes: true });
  const entries: FolderEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    const childAbs = path.join(normalized, d.name);
    try {
      const s = await fs.stat(childAbs);
      entries.push({
        name: d.name,
        isDir: d.isDirectory(),
        size: s.size,
        mtime: s.mtimeMs,
      });
    } catch {
      /* skip */
    }
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.mtime - a.mtime;
  });

  // parent: zone root 위로는 못 올라감
  const zoneRoot = getZoneRoot(zone);
  const parent = normalized === zoneRoot ? null : path.dirname(normalized);

  return { path: normalized, zone, parent, entries };
}
