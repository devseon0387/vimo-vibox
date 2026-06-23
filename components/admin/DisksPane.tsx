"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  HardDrive,
  Folder,
  FileText,
  ChevronLeft,
  RefreshCcw,
  Lock,
  Layers,
  Package,
  User,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Database,
  Truck,
  Save,
} from "lucide-react";
import type { DiskVolume, FolderListing, ZoneTag } from "@/lib/disks";
import type { BackupStatus } from "@/lib/backup-status";

const ZONE_LABELS: Record<ZoneTag, string> = {
  rendering: "렌더링",
  library: "자료실",
  personal: "개인 박스",
  notes: "개발 노트",
};

const ZONE_ICONS: Record<ZoneTag, typeof HardDrive> = {
  rendering: Layers,
  library: Package,
  personal: User,
  notes: Pencil,
};

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function DisksPane({
  volumes,
  backup,
  initialPath,
  initialDrilldown,
}: {
  volumes: DiskVolume[];
  backup: BackupStatus;
  initialPath: string | null;
  initialDrilldown: FolderListing | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentPath = sp.get("path") ?? initialPath;

  const [drilldown, setDrilldown] = useState<FolderListing | null>(initialDrilldown);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!currentPath) {
      setDrilldown(null);
      return;
    }
    if (currentPath === initialPath && initialDrilldown) {
      setDrilldown(initialDrilldown);
      return;
    }
    let aborted = false;
    setLoading(true);
    fetch(`/api/admin/disks/browse?path=${encodeURIComponent(currentPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FolderListing | null) => {
        if (!aborted) setDrilldown(d);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [currentPath, initialPath, initialDrilldown]);

  const navigate = (p: string | null) => {
    if (!p) {
      router.push("/admin/disks");
    } else {
      router.push(`/admin/disks?path=${encodeURIComponent(p)}`);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetch("/api/admin/disks?force=1").catch(() => {});
    router.refresh();
    setRefreshing(false);
  };

  if (currentPath && drilldown) {
    return (
      <DrilldownView
        listing={drilldown}
        loading={loading}
        onNavigate={navigate}
      />
    );
  }

  if (currentPath && !drilldown && !loading) {
    return (
      <div className="px-8 py-10 max-w-[900px]">
        <button
          onClick={() => navigate(null)}
          className="text-sm text-text-soft hover:text-accent flex items-center gap-1 mb-4"
        >
          <ChevronLeft size={14} /> 디스크 목록으로
        </button>
        <div className="bg-danger-soft text-danger px-4 py-3 rounded-md text-base">
          이 경로는 탐색할 수 없습니다 (비박스가 관리하는 zone 안이 아니거나 접근 불가).
          <div className="mt-2 font-mono text-xs text-text-soft break-all">{currentPath}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-[1400px]">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-extrabold">디스크 인벤토리</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-soft border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          <RefreshCcw size={12} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
          새로고침
        </button>
      </div>
      <p className="text-base text-text-soft mb-6">
        이 머신에 마운트된 모든 볼륨. 비박스가 관리하는 zone은 <span className="text-accent font-semibold">오렌지 뱃지</span>로 표시 — 클릭하면 폴더 진입 가능.
      </p>

      <BackupStatusPanel backup={backup} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {volumes.map((v) => (
          <VolumeCard
            key={v.mountPath}
            volume={v}
            backup={backup}
            onNavigate={navigate}
          />
        ))}
      </div>
    </div>
  );
}

function BackupStatusPanel({ backup }: { backup: BackupStatus }) {
  const ok = backup.litestreamRunning && backup.replicaExists && !backup.ageWarning;
  const Icon = ok ? ShieldCheck : ShieldAlert;
  const tone = ok
    ? "border-success/40 bg-success-soft text-success"
    : "border-warning/40 bg-warning-soft text-warning";
  return (
    <div className={`mb-6 border rounded-xl px-5 py-4 ${tone}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} strokeWidth={2.2} />
        <div className="text-md font-bold">DB 백업 (Litestream)</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
        <Stat
          label="Daemon"
          value={
            backup.litestreamRunning
              ? `pid ${backup.litestreamPid} · ${formatUptime(backup.litestreamUptimeSec ?? 0)}`
              : "정지됨"
          }
          ok={backup.litestreamRunning}
        />
        <Stat
          label="복제본"
          value={backup.replicaExists ? "활성" : "디스크 미연결"}
          ok={backup.replicaExists}
        />
        <Stat
          label="최근 동기화"
          value={backup.lastSyncMs ? relativeTime(backup.lastSyncMs) : "—"}
          ok={!backup.ageWarning}
        />
        <Stat
          label="복제 크기"
          value={backup.replicaSizeBytes > 0 ? formatBytes(backup.replicaSizeBytes) : "—"}
          ok
        />
      </div>
      {backup.replicaPath && (
        <div className="text-xs font-mono text-text-soft mt-3 break-all opacity-90">
          {backup.replicaPath}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest opacity-80 mb-0.5">
        {label}
      </div>
      <div className={`font-semibold ${ok ? "" : "opacity-90"}`}>{value}</div>
    </div>
  );
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = diff / 1000;
  if (sec < 5) return "방금";
  if (sec < 60) return `${Math.floor(sec)}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function VolumeCard({
  volume,
  backup,
  onNavigate,
}: {
  volume: DiskVolume;
  backup: BackupStatus;
  onNavigate: (p: string) => void;
}) {
  const usedPct = volume.totalBytes > 0 ? (volume.usedBytes / volume.totalBytes) * 100 : 0;
  const isFull = usedPct > 88;
  const accessible = volume.totalBytes > 0;
  const hostsReplica = !!backup.replicaPath?.startsWith(volume.mountPath + "/");
  const migrationCandidate = volume.managed; // Vibox zone 있으면 Mac mini 이전 대상

  return (
    <div
      className={`border rounded-xl bg-white overflow-hidden ${
        volume.managed ? "border-accent/40 shadow-[0_2px_8px_rgba(232,80,8,0.06)]" : "border-border"
      }`}
    >
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5 mb-1">
          <HardDrive
            size={18}
            strokeWidth={2}
            className={volume.managed ? "text-accent" : "text-text-soft"}
          />
          <h3 className="text-lg font-bold text-text">{volume.name}</h3>
          <span className="text-2xs uppercase tracking-wider text-text-faint font-mono ml-auto">
            {volume.fsType}
          </span>
        </div>
        <div className="text-xs text-text-faint font-mono break-all mb-2">
          {volume.mountPath}
        </div>

        {(migrationCandidate || hostsReplica) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {migrationCandidate && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent text-white tracking-wider uppercase">
                <Truck size={10} strokeWidth={2.4} /> Mac mini 이전 대상
              </span>
            )}
            {hostsReplica && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-success-soft text-success tracking-wider uppercase">
                <Database size={10} strokeWidth={2.4} /> DB 백업 호스트
              </span>
            )}
          </div>
        )}

        {accessible ? (
          <>
            <div className="flex items-baseline justify-between text-xs text-text-soft mb-1.5">
              <span>{formatBytes(volume.usedBytes)} / {formatBytes(volume.totalBytes)}</span>
              <span className={isFull ? "text-danger font-semibold" : "text-text-faint"}>
                {usedPct.toFixed(1)}% 사용
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full ${isFull ? "bg-danger" : "bg-accent"}`}
                style={{ width: `${Math.min(100, usedPct)}%` }}
              />
            </div>
            <div className="text-xs text-text-faint mt-1.5">
              여유 {formatBytes(volume.freeBytes)}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-text-faint">
            <Lock size={12} /> 접근 불가 (시스템 볼륨 또는 권한 부족)
          </div>
        )}
      </div>

      {accessible && volume.topEntries.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-border">
          <div className="text-2xs text-text-faint uppercase tracking-wider mb-2 font-semibold">
            최상위 폴더 ({volume.topEntries.length})
          </div>
          <div className="flex flex-col gap-px">
            {volume.topEntries.slice(0, 12).map((e) => {
              const abs = `${volume.mountPath}/${e.name}`;
              const Icon = e.zone
                ? ZONE_ICONS[e.zone]
                : e.isDir
                  ? Folder
                  : FileText;
              const Wrapper: React.ElementType = e.zone ? Link : "div";
              const linkProps = e.zone
                ? { href: `/admin/disks?path=${encodeURIComponent(abs)}` }
                : {};
              return (
                <Wrapper
                  key={e.name}
                  {...linkProps}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm font-mono ${
                    e.zone
                      ? "text-accent hover:bg-accent-soft cursor-pointer"
                      : "text-text-soft"
                  }`}
                >
                  <Icon size={13} strokeWidth={2} className="shrink-0 opacity-80" />
                  <span className="truncate">{e.name}</span>
                  {e.zone && (
                    <span className="text-2xs px-1.5 py-px rounded bg-accent-soft text-accent ml-auto font-sans tracking-wider uppercase">
                      {ZONE_LABELS[e.zone]}
                    </span>
                  )}
                </Wrapper>
              );
            })}
            {volume.topEntries.length > 12 && (
              <div className="text-xs text-text-faint pl-2 pt-1">
                + {volume.topEntries.length - 12}개 더
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DrilldownView({
  listing,
  loading,
  onNavigate,
}: {
  listing: FolderListing;
  loading: boolean;
  onNavigate: (p: string | null) => void;
}) {
  return (
    <div className="px-8 py-6 max-w-[1100px]">
      <button
        onClick={() => (listing.parent ? onNavigate(listing.parent) : onNavigate(null))}
        className="text-sm text-text-soft hover:text-accent flex items-center gap-1 mb-3"
      >
        <ChevronLeft size={14} />
        {listing.parent ? "상위 폴더" : "디스크 목록"}
      </button>

      <div className="flex items-center gap-2 mb-1">
        {(() => {
          const Icon = ZONE_ICONS[listing.zone];
          return <Icon size={20} strokeWidth={2} className="text-accent" />;
        })()}
        <h1 className="text-[20px] font-extrabold">{ZONE_LABELS[listing.zone]} zone</h1>
      </div>
      <div className="text-sm font-mono text-text-faint break-all mb-5">
        {listing.path}
      </div>

      <div className="border border-border rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface text-xs text-text-faint flex items-center justify-between">
          <span>{listing.entries.length}개 항목</span>
          {loading && <span>로딩 중…</span>}
        </div>
        <div className="divide-y divide-border">
          {listing.entries.length === 0 ? (
            <div className="px-6 py-10 text-center text-text-faint text-base">
              비어있는 폴더
            </div>
          ) : (
            listing.entries.map((e) => {
              const abs = `${listing.path}/${e.name}`;
              const Icon = e.isDir ? Folder : FileText;
              const Wrapper: React.ElementType = e.isDir ? Link : "div";
              const linkProps = e.isDir
                ? { href: `/admin/disks?path=${encodeURIComponent(abs)}` }
                : {};
              return (
                <Wrapper
                  key={e.name}
                  {...linkProps}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    e.isDir
                      ? "hover:bg-surface cursor-pointer text-text"
                      : "text-text-soft"
                  }`}
                >
                  <Icon
                    size={14}
                    strokeWidth={2}
                    className={e.isDir ? "text-text-soft" : "text-text-faint"}
                  />
                  <span className="text-base font-mono truncate flex-1">{e.name}</span>
                  <span className="text-xs text-text-faint">
                    {e.isDir ? "폴더" : formatBytes(e.size)}
                  </span>
                  <span className="text-xs text-text-faint hidden md:inline w-32 text-right">
                    {new Date(e.mtime).toLocaleString("ko-KR")}
                  </span>
                </Wrapper>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
