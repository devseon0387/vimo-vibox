"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Upload as UploadIcon,
  Loader2,
  RefreshCw,
  HardDrive,
  Activity,
  AlertTriangle,
  Download,
  Cpu,
  MemoryStick,
  Wifi,
  Gauge,
  Heart,
  ShieldCheck,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Layers,
  Snowflake,
  Flame,
  Copy,
  Film,
  RotateCcw,
} from "lucide-react";
import { humanError } from "@/lib/human-error";

type DiskIO = {
  deviceName: string;
  mountPoint?: string;
  readBytesPerSec: number;
  writeBytesPerSec: number;
  tps: number;
};

type HealthSnapshot = {
  timestamp: number;
  remoteHost: string | null;
  swap: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    encrypted: boolean;
  } | null;
  memoryPressure: {
    kernelTaskCpuPct: number | null;
    swapped: boolean;
  } | null;
  ping: {
    host: string;
    avgMs: number;
    loss: number;
    ok: boolean;
  } | null;
  pm2: {
    name: string;
    status: string;
    pid: number;
    restartCount: number;
    uptimeSec: number;
    memoryBytes: number;
    cpu: number;
  }[];
  litestream: {
    launchdLoaded: boolean;
    processAlive: boolean;
    lastBackupAt: number | null;
    backupSizeBytes: number | null;
  };
  smart: {
    modelName: string;
    serial: string;
    capacityBytes: number;
    usbSpeed: string;
    status:
      | "Verified"
      | "Failing"
      | "Not Supported"
      | "Unknown"
      | "Disconnected";
    tier: "hot" | "warm" | "cold";
    volumeLabel: string;
    connected: boolean;
  }[];
  volumes: {
    tier: "hot" | "warm" | "cold";
    label: string;
    mountPath: string;
    mounted: boolean;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
  }[];
  mirror: {
    launchdLoaded: boolean;
    latestDate: string | null;
    latestAt: number | null;
    snapshotCount: number;
    totalBytes: number;
    lastLogTail: string | null;
  } | null;
  encoding: {
    active: {
      id: string;
      filePath: string;
      progress: number;
      startedAt: number | null;
    }[];
    queuedCount: number;
    doneCount: number;
    failedCount: number;
    totalAssets: number;
    totalAssetBytes: number;
    recentFailed: {
      id: string;
      filePath: string;
      error: string | null;
      finishedAt: number | null;
    }[];
  };
};

type SystemSnapshot = {
  timestamp: number;
  remoteHost: string | null;
  cpu: {
    usage: number;
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
  network: {
    interfaceName: string;
    rxBytesPerSec: number;
    txBytesPerSec: number;
  } | null;
};

type StatsResponse = {
  range: { from: number; to: number };
  total: { bytes: number; count: number };
  today: { bytes: number; count: number };
  last7: { bytes: number; count: number };
  last30: { bytes: number; count: number };
  thisMonth: { bytes: number; count: number };
  rangeTotal: { bytes: number; count: number };
  liveBytesPerSec: number;
  bySource: { source: string; bytes: number; count: number }[];
  daily: { day: string; bytes: number; count: number }[];
  topFiles: { path: string; bytes: number; count: number }[];
  topShares: {
    token: string | null;
    title: string | null;
    filePath: string | null;
    bytes: number;
    count: number;
  }[];
  topUsers: {
    userId: string | null;
    username: string | null;
    name: string | null;
    role: string | null;
    bytes: number;
    count: number;
  }[];
  activeShares: number;
  storage: {
    usedBytes: number;
    fileCount: number;
    totalBytes: number | null;
    freeBytes: number | null;
  } | null;
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
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatBytesPerSec(n: number): string {
  if (n === 0) return "0 B/s";
  return `${formatBytes(n)}/s`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  download: { label: "내부 다운로드", color: "#2563eb" },
  share: { label: "공유 링크", color: "#16a34a" },
  thumb: { label: "썸네일", color: "#a855f7" },
  upload: { label: "업로드 (인바운드)", color: "#f59e0b" },
};

type Preset = "today" | "7d" | "30d" | "thismonth" | "lastmonth" | "custom";

const MONTHLY_LIMIT_KEY = "vibox:monthlyLimitTB";

function useMonthlyLimit(): [number, (v: number) => void] {
  const [value, setValue] = useState(10);
  useEffect(() => {
    const saved = localStorage.getItem(MONTHLY_LIMIT_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n > 0) setValue(n);
    }
  }, []);
  const update = (v: number) => {
    setValue(v);
    try {
      localStorage.setItem(MONTHLY_LIMIT_KEY, String(v));
    } catch {}
  };
  return [value, update];
}

function dateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { from: number; to: number } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const todayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  switch (preset) {
    case "today":
      return { from: todayStart, to: now };
    case "7d":
      return { from: todayStart - 6 * day, to: now };
    case "30d":
      return { from: todayStart - 29 * day, to: now };
    case "thismonth": {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to: now };
    }
    case "lastmonth": {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      const toEnd = d.getTime() - 1;
      const lastMonthStart = new Date(d);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
      return { from: lastMonthStart.getTime(), to: toEnd };
    }
    case "custom": {
      const from = customFrom
        ? new Date(customFrom).getTime()
        : todayStart - 29 * day;
      const to = customTo
        ? new Date(customTo).getTime() + day - 1
        : now;
      return { from, to };
    }
  }
}

export function StatsAdmin() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState(() =>
    dateInputValue(Date.now() - 29 * 24 * 60 * 60 * 1000),
  );
  const [customTo, setCustomTo] = useState(() => dateInputValue(Date.now()));
  const [monthlyLimitTB, setMonthlyLimitTB] = useMonthlyLimit();

  const range = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const load = async (opts?: { silent?: boolean; skipStorage?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("from", String(range.from));
      qs.set("to", String(range.to));
      if (opts?.skipStorage) qs.set("includeStorage", "0");
      const res = await fetch(`/api/admin/stats?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      const json = (await res.json()) as StatsResponse;
      setData((prev) =>
        opts?.skipStorage && prev?.storage ? { ...json, storage: prev.storage } : json,
      );
    } catch (e) {
      setError(humanError(e instanceof Error ? e.message : "unknown", "general"));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // 10초마다 실시간 속도·수치 폴링 (storage는 무거워서 제외)
  useEffect(() => {
    const id = setInterval(() => {
      load({ silent: true, skipStorage: true });
    }, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // 시스템 상태 2초마다 폴링
  useEffect(() => {
    let cancelled = false;
    const fetchSystem = async () => {
      try {
        const res = await fetch("/api/admin/system");
        if (!res.ok || cancelled) return;
        const snap = (await res.json()) as SystemSnapshot;
        if (!cancelled) setSystem(snap);
      } catch {
        /* 무시 */
      }
    };
    fetchSystem();
    const id = setInterval(fetchSystem, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 건강도 30초마다 폴링 (SMART 포함 무거움)
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/admin/health");
        if (!res.ok || cancelled) return;
        const snap = (await res.json()) as HealthSnapshot;
        if (!cancelled) setHealth(snap);
      } catch {
        /* 무시 */
      }
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [["day", "bytes", "count"]];
    for (const d of data.daily) rows.push([d.day, String(d.bytes), String(d.count)]);
    rows.push([]);
    rows.push(["TOP FILES"]);
    rows.push(["path", "bytes", "count"]);
    for (const f of data.topFiles) rows.push([f.path, String(f.bytes), String(f.count)]);
    rows.push([]);
    rows.push(["TOP SHARES"]);
    rows.push(["token", "title", "bytes", "count"]);
    for (const s of data.topShares)
      rows.push([s.token ?? "", s.title ?? "", String(s.bytes), String(s.count)]);
    rows.push([]);
    rows.push(["TOP USERS"]);
    rows.push(["userId", "name", "role", "bytes", "count"]);
    for (const u of data.topUsers)
      rows.push([
        u.userId ?? "",
        u.name ?? u.username ?? "",
        u.role ?? "",
        String(u.bytes),
        String(u.count),
      ]);

    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibox-traffic-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 월 한도 경고 계산
  const monthlyLimitBytes = monthlyLimitTB * 1024 ** 4;
  const monthUsage = data?.thisMonth.bytes ?? 0;
  const monthPct = monthlyLimitBytes > 0 ? (monthUsage / monthlyLimitBytes) * 100 : 0;
  const monthWarning =
    monthPct >= 100
      ? { tone: "danger" as const, text: `월 한도 초과 (${monthPct.toFixed(0)}%)` }
      : monthPct >= 80
        ? { tone: "warn" as const, text: `월 한도 80% 도달 (${monthPct.toFixed(0)}%)` }
        : null;

  return (
    <>
      <div className="flex items-start md:items-center gap-2 justify-between mb-1 flex-col md:flex-row">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} strokeWidth={2.5} className="text-text" />
          <h1 className="text-2xl font-bold">트래픽 통계</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!data || loading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text hover:bg-hover disabled:opacity-50 px-2.5 py-1.5 rounded-md"
          >
            <Download size={13} strokeWidth={2.5} />
            CSV
          </button>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text hover:bg-hover disabled:opacity-50 px-2.5 py-1.5 rounded-md"
          >
            {loading ? (
              <Loader2 size={13} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={2.5} />
            )}
            새로고침
          </button>
        </div>
      </div>
      <p className="text-base text-text-muted mb-5">
        서버가 주고받은 바이트 집계. 10초마다 자동 새로고침. CSV 내보내기로 회계 자료 활용 가능.
      </p>

      {/* 월 한도 경고 */}
      {monthWarning && (
        <div
          className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-sm border ${
            monthWarning.tone === "danger"
              ? "bg-danger-soft border-[#fee2e2] text-danger"
              : "bg-warning-soft border-[#fde68a] text-warning"
          }`}
        >
          <AlertTriangle size={14} strokeWidth={2.3} />
          <span className="font-semibold">{monthWarning.text}</span>
          <span className="opacity-80">
            이번 달 {formatBytes(monthUsage)} / {formatBytes(monthlyLimitBytes)}
          </span>
        </div>
      )}

      {error && (
        <div className="text-sm text-danger bg-danger-soft border border-[#fee2e2] rounded-md px-3 py-2 mb-5">
          {error}
        </div>
      )}

      {!data && loading && (
        <div className="text-base text-text-muted">불러오는 중…</div>
      )}

      {data && (
        <>
          {/* 요약 카드 (5개) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            <LiveCard bytesPerSec={data.liveBytesPerSec} />
            <SummaryCard
              label="오늘"
              bytes={data.today.bytes}
              count={data.today.count}
              accent="blue"
            />
            <SummaryCard
              label="7일"
              bytes={data.last7.bytes}
              count={data.last7.count}
              accent="green"
            />
            <SummaryCard
              label="이번 달"
              bytes={data.thisMonth.bytes}
              count={data.thisMonth.count}
              accent="violet"
            />
            <SummaryCard
              label="전체 누적"
              bytes={data.total.bytes}
              count={data.total.count}
              accent="slate"
            />
          </div>

          {/* 스토리지 카드 + 월 한도 설정 */}
          <div className="grid md:grid-cols-2 gap-3 mb-5">
            <StorageCard storage={data.storage} />
            <MonthlyLimitCard
              limitTB={monthlyLimitTB}
              onChange={setMonthlyLimitTB}
              usage={monthUsage}
            />
          </div>

          {/* 시스템 실시간 상태 */}
          <SystemStatusSection system={system} />

          {/* 시스템 건강도 */}
          <SystemHealthSection health={health} />

          {/* 날짜 범위 선택 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-bold text-text-soft uppercase tracking-wider">
              기간
            </span>
            {(
              [
                ["today", "오늘"],
                ["7d", "7일"],
                ["30d", "30일"],
                ["thismonth", "이번 달"],
                ["lastmonth", "지난 달"],
                ["custom", "직접"],
              ] as [Preset, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`text-sm font-semibold px-2.5 py-1 rounded border transition-colors ${
                  preset === k
                    ? "bg-text text-white border-text"
                    : "bg-white text-text-muted border-border hover:border-border-hover"
                }`}
              >
                {label}
              </button>
            ))}
            {preset === "custom" && (
              <div className="flex items-center gap-1.5 text-sm ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-border rounded px-1.5 py-0.5 text-text"
                />
                <span className="text-text-faint">~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-border rounded px-1.5 py-0.5 text-text"
                />
              </div>
            )}
          </div>

          {/* 일별 차트 */}
          <div className="bg-white border border-border rounded-lg p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-text">
                기간 일별 추이
              </h2>
              <span className="text-xs text-text-muted">
                총 {formatBytes(data.rangeTotal.bytes)} · {formatCount(data.rangeTotal.count)}회
              </span>
            </div>
            <DailyChart daily={data.daily} />
          </div>

          {/* 소스별 분해 + 요약 */}
          <div className="grid md:grid-cols-2 gap-3 mb-5">
            <div className="bg-white border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-text mb-3">
                경로별 분해 (기간)
              </h2>
              <SourceBreakdown
                bySource={data.bySource}
                total={data.rangeTotal.bytes}
              />
            </div>

            <div className="bg-white border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-text mb-3">
                요약
              </h2>
              <dl className="space-y-2 text-base">
                <Row label="활성 공유 링크" value={`${data.activeShares}개`} />
                <Row
                  label="기간 일 평균"
                  value={
                    data.daily.length > 0
                      ? formatBytes(data.rangeTotal.bytes / data.daily.length)
                      : "—"
                  }
                />
                <Row
                  label="파일당 평균 전송"
                  value={
                    data.rangeTotal.count > 0
                      ? formatBytes(data.rangeTotal.bytes / data.rangeTotal.count)
                      : "—"
                  }
                />
                <Row
                  label="CDN 필요 시점 (월 10TB)"
                  value={
                    data.thisMonth.bytes >= 10 * 1024 ** 4
                      ? "🔴 도달"
                      : data.thisMonth.bytes >= 5 * 1024 ** 4
                        ? "🟡 접근 중"
                        : "🟢 여유"
                  }
                />
              </dl>
            </div>
          </div>

          {/* TOP 3섹션 */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            <TopList
              title="TOP 파일"
              items={data.topFiles.map((f) => ({
                key: f.path,
                label: basename(f.path),
                sub: f.path,
                bytes: f.bytes,
                count: f.count,
              }))}
            />
            <TopList
              title="TOP 공유 링크"
              items={data.topShares.map((s) => ({
                key: s.token ?? "",
                label: s.title ?? basename(s.filePath ?? s.token ?? ""),
                sub: s.filePath ?? "",
                href: s.token ? `/s/${s.token}` : undefined,
                bytes: s.bytes,
                count: s.count,
              }))}
            />
            <TopList
              title="TOP 사용자"
              items={data.topUsers.map((u) => ({
                key: u.userId ?? "",
                label: u.name ?? u.username ?? u.userId ?? "알수없음",
                sub:
                  (u.username ? `@${u.username}` : "") +
                  (u.role ? ` · ${u.role}` : ""),
                bytes: u.bytes,
                count: u.count,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}

function SystemHealthSection({
  health,
}: {
  health: HealthSnapshot | null;
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart size={15} strokeWidth={2.3} className="text-text" />
          <h2 className="text-base font-bold text-text">시스템 건강도</h2>
          <span className="text-xs text-text-faint">30초 간격 갱신</span>
        </div>
      </div>

      {!health ? (
        <div className="text-sm text-text-faint italic">불러오는 중…</div>
      ) : (
        <>
          {/* 3-Tier 볼륨 사용량 */}
          {health.volumes && health.volumes.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-sm font-bold text-text mb-2">
                <Layers size={13} strokeWidth={2.3} />
                백업 계층 (3-Tier)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {health.volumes.map((v) => (
                  <VolumeCard key={v.label} volume={v} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <SmartCard smart={health.smart} />
            <SwapCard
              swap={health.swap}
              memoryPressure={health.memoryPressure}
            />
            <PingCard ping={health.ping} />
            <Pm2Card pm2={health.pm2} />
            <LitestreamCard litestream={health.litestream} />
            <MirrorCard mirror={health.mirror} />
            <EncodingCard encoding={health.encoding} />
          </div>
        </>
      )}
    </div>
  );
}

function HealthCard({
  icon,
  title,
  statusText,
  statusTone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  statusText: string;
  statusTone: "ok" | "warn" | "bad" | "muted";
  children: React.ReactNode;
}) {
  const toneStyles = {
    ok: "bg-success-soft border-emerald-200",
    warn: "bg-amber-50 border-amber-200",
    bad: "bg-danger-soft border-rose-200",
    muted: "bg-surface border-border",
  };
  const badgeStyles = {
    ok: "bg-success text-white",
    warn: "bg-amber-500 text-white",
    bad: "bg-danger text-white",
    muted: "bg-surface-2 text-text-soft",
  };
  const StatusIcon =
    statusTone === "ok"
      ? CheckCircle2
      : statusTone === "warn"
        ? AlertTriangle
        : statusTone === "bad"
          ? XCircle
          : MinusCircle;
  return (
    <div className={`rounded-lg border p-3 ${toneStyles[statusTone]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-text">
          {icon}
          {title}
        </div>
        <span
          className={`inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded ${badgeStyles[statusTone]}`}
        >
          <StatusIcon size={9} strokeWidth={2.5} />
          {statusText}
        </span>
      </div>
      {children}
    </div>
  );
}

function SmartCard({ smart }: { smart: HealthSnapshot["smart"] }) {
  if (!smart || smart.length === 0) {
    return (
      <HealthCard
        icon={<ShieldCheck size={13} strokeWidth={2.3} />}
        title="디스크 SMART"
        statusText="미탐지"
        statusTone="muted"
      >
        <div className="text-xs text-text-faint">
          system_profiler 로 외장 디스크 못 찾음
        </div>
      </HealthCard>
    );
  }

  // 전체 카드의 tone: 하나라도 Failing → bad, 하나라도 Disconnected → warn, 모두 Verified → ok
  const overallTone = smart.some((s) => s.status === "Failing")
    ? ("bad" as const)
    : smart.some((s) => !s.connected)
      ? ("warn" as const)
      : smart.every((s) => s.status === "Verified")
        ? ("ok" as const)
        : ("muted" as const);
  const overallLabel =
    overallTone === "bad"
      ? "고장 감지"
      : overallTone === "warn"
        ? "일부 미연결"
        : overallTone === "ok"
          ? `${smart.length}개 정상`
          : "일부 미지원";

  return (
    <HealthCard
      icon={<ShieldCheck size={13} strokeWidth={2.3} />}
      title="디스크 SMART"
      statusText={overallLabel}
      statusTone={overallTone}
    >
      <div className="space-y-1.5 text-xs">
        {smart.map((s) => (
          <SmartRow key={s.volumeLabel} smart={s} />
        ))}
      </div>
    </HealthCard>
  );
}

function SmartRow({ smart: s }: { smart: HealthSnapshot["smart"][number] }) {
  const tierIcon = {
    hot: <Flame size={10} strokeWidth={2.3} className="text-rose-500" />,
    warm: <Copy size={10} strokeWidth={2.3} className="text-amber-500" />,
    cold: <Snowflake size={10} strokeWidth={2.3} className="text-sky-500" />,
  }[s.tier];
  const statusStyle = (() => {
    if (!s.connected)
      return { color: "text-text-faint", icon: "✕", label: "미연결" };
    if (s.status === "Verified")
      return { color: "text-success", icon: "✓", label: "정상" };
    if (s.status === "Failing")
      return { color: "text-danger", icon: "⚠", label: "고장 징후" };
    if (s.status === "Not Supported")
      return { color: "text-text-muted", icon: "—", label: "미지원" };
    return { color: "text-text-muted", icon: "?", label: "알 수 없음" };
  })();
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{tierIcon}</span>
      <span className="shrink-0 font-semibold text-text min-w-0 truncate">
        {s.volumeLabel}
      </span>
      <span className="text-text-faint truncate">{s.modelName}</span>
      <span className={`ml-auto shrink-0 font-semibold ${statusStyle.color}`}>
        {statusStyle.icon} {statusStyle.label}
      </span>
    </div>
  );
}

function SwapCard({
  swap,
  memoryPressure,
}: {
  swap: HealthSnapshot["swap"];
  memoryPressure: HealthSnapshot["memoryPressure"];
}) {
  if (!swap) {
    return (
      <HealthCard
        icon={<MemoryStick size={13} strokeWidth={2.3} />}
        title="스왑 / 메모리 압박"
        statusText="측정 실패"
        statusTone="muted"
      >
        <div className="text-xs text-text-faint">—</div>
      </HealthCard>
    );
  }
  const swapGB = swap.usedBytes / 1024 ** 3;
  const kernelCpu = memoryPressure?.kernelTaskCpuPct ?? 0;
  const tone =
    swapGB > 10 || kernelCpu > 50
      ? "bad"
      : swapGB > 2 || kernelCpu > 20
        ? "warn"
        : "ok";
  const label =
    tone === "bad" ? "위험" : tone === "warn" ? "주의" : "정상";
  return (
    <HealthCard
      icon={<MemoryStick size={13} strokeWidth={2.3} />}
      title="스왑 / 메모리 압박"
      statusText={label}
      statusTone={tone}
    >
      <div className="space-y-0.5 text-xs text-text-muted">
        <div>
          스왑 사용:{" "}
          <span className="font-semibold text-text tabular-nums">
            {formatBytes(swap.usedBytes)}
          </span>{" "}
          / {formatBytes(swap.totalBytes)}
        </div>
        {memoryPressure?.kernelTaskCpuPct !== null && memoryPressure?.kernelTaskCpuPct !== undefined && (
          <div>
            kernel_task CPU:{" "}
            <span className="font-semibold text-text tabular-nums">
              {memoryPressure.kernelTaskCpuPct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </HealthCard>
  );
}

function PingCard({ ping }: { ping: HealthSnapshot["ping"] }) {
  if (!ping) {
    return (
      <HealthCard
        icon={<Wifi size={13} strokeWidth={2.3} />}
        title="인터넷 응답"
        statusText="측정 실패"
        statusTone="muted"
      >
        <div className="text-xs text-text-faint">—</div>
      </HealthCard>
    );
  }
  const tone =
    !ping.ok || ping.loss > 0.1 || ping.avgMs > 100
      ? "bad"
      : ping.avgMs > 50 || ping.loss > 0
        ? "warn"
        : "ok";
  const label = tone === "bad" ? "불안정" : tone === "warn" ? "주의" : "원활";
  return (
    <HealthCard
      icon={<Wifi size={13} strokeWidth={2.3} />}
      title="인터넷 응답"
      statusText={label}
      statusTone={tone}
    >
      <div className="space-y-0.5 text-xs text-text-muted">
        <div>
          {ping.host}:{" "}
          <span className="font-semibold text-text tabular-nums">
            {ping.avgMs.toFixed(1)}ms
          </span>
        </div>
        <div>
          패킷 손실:{" "}
          <span className="font-semibold text-text tabular-nums">
            {(ping.loss * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </HealthCard>
  );
}

function Pm2Card({ pm2 }: { pm2: HealthSnapshot["pm2"] }) {
  const vibox = pm2.find((p) => p.name === "vimo-cloud" || p.name === "vibox");
  if (pm2.length === 0) {
    return (
      <HealthCard
        icon={<Server size={13} strokeWidth={2.3} />}
        title="Vibox 프로세스"
        statusText="없음"
        statusTone="bad"
      >
        <div className="text-xs text-text-faint">PM2 미실행</div>
      </HealthCard>
    );
  }
  const running = vibox && vibox.status === "online";
  const highRestart = (vibox?.restartCount ?? 0) > 50;
  const tone = !running ? "bad" : highRestart ? "warn" : "ok";
  const label = !running ? "중단됨" : highRestart ? "재시작 많음" : "정상";
  return (
    <HealthCard
      icon={<Server size={13} strokeWidth={2.3} />}
      title="Vibox 프로세스"
      statusText={label}
      statusTone={tone}
    >
      {vibox ? (
        <div className="space-y-0.5 text-xs text-text-muted">
          <div>
            <span className="font-semibold text-text">{vibox.name}</span>
            <span className="text-text-faint"> · pid {vibox.pid}</span>
          </div>
          <div>
            가동 {formatUptime(vibox.uptimeSec)} · 재시작{" "}
            <span
              className={
                vibox.restartCount > 50
                  ? "text-amber-600 font-semibold"
                  : "text-text"
              }
            >
              {vibox.restartCount}
            </span>
            회
          </div>
          <div>
            메모리 {formatBytes(vibox.memoryBytes)} · CPU {vibox.cpu}%
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-faint">vibox 프로세스 없음</div>
      )}
    </HealthCard>
  );
}

function LitestreamCard({
  litestream,
}: {
  litestream: HealthSnapshot["litestream"];
}) {
  const ageMs = litestream.lastBackupAt
    ? Date.now() - litestream.lastBackupAt
    : Infinity;
  const tone = !litestream.processAlive
    ? "bad"
    : ageMs > 2 * 60 * 60 * 1000 // 2시간 이상 백업 없음
      ? "warn"
      : "ok";
  const label = !litestream.processAlive
    ? "중단됨"
    : tone === "warn"
      ? "지연"
      : "동작 중";
  return (
    <HealthCard
      icon={<Database size={13} strokeWidth={2.3} />}
      title="Litestream 백업"
      statusText={label}
      statusTone={tone}
    >
      <div className="space-y-0.5 text-xs text-text-muted">
        <div>
          프로세스:{" "}
          <span
            className={`font-semibold ${litestream.processAlive ? "text-success" : "text-danger"}`}
          >
            {litestream.processAlive ? "live" : "down"}
          </span>
          <span className="text-text-faint">
            {" · "}
            {litestream.launchdLoaded ? "launchd 등록됨" : "launchd 없음"}
          </span>
        </div>
        {litestream.lastBackupAt ? (
          <div>
            최근 백업:{" "}
            <span className="font-semibold text-text">
              {formatBackupAge(ageMs)}
            </span>
          </div>
        ) : (
          <div className="text-text-faint">백업 파일 미발견</div>
        )}
        {litestream.backupSizeBytes !== null && (
          <div>
            보관 크기{" "}
            <span className="font-semibold text-text tabular-nums">
              {formatBytes(litestream.backupSizeBytes)}
            </span>
          </div>
        )}
      </div>
    </HealthCard>
  );
}

function VolumeCard({
  volume,
}: {
  volume: HealthSnapshot["volumes"][number];
}) {
  const pct =
    volume.totalBytes > 0
      ? Math.min(100, (volume.usedBytes / volume.totalBytes) * 100)
      : 0;
  const tierMeta = {
    hot: {
      icon: <Flame size={12} strokeWidth={2.3} className="text-rose-500" />,
      label: "HOT",
      desc: "원본 서비스",
      barColor: "bg-rose-500",
    },
    warm: {
      icon: <Copy size={12} strokeWidth={2.3} className="text-amber-500" />,
      label: "WARM",
      desc: "세대 스냅샷",
      barColor: "bg-amber-500",
    },
    cold: {
      icon: <Snowflake size={12} strokeWidth={2.3} className="text-sky-500" />,
      label: "COLD",
      desc: "TM · DB · 아카이브",
      barColor: "bg-sky-500",
    },
  }[volume.tier];

  // 경고: 마운트 안됨, 85% 이상, 95% 이상
  const warnPct = pct >= 95 ? "bad" : pct >= 85 ? "warn" : "ok";
  const mounted = volume.mounted && volume.totalBytes > 0;

  return (
    <div
      className={`rounded-lg border bg-white p-3 ${
        !mounted
          ? "border-rose-200 bg-danger-soft"
          : warnPct === "bad"
            ? "border-rose-200"
            : warnPct === "warn"
              ? "border-amber-200"
              : "border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {tierMeta.icon}
          <span className="text-2xs font-bold tracking-widest text-text-faint">
            {tierMeta.label}
          </span>
          <span className="text-sm font-bold text-text truncate max-w-[180px]">
            {volume.label}
          </span>
        </div>
        {!mounted && (
          <span className="text-2xs font-bold text-danger inline-flex items-center gap-0.5">
            <XCircle size={9} strokeWidth={2.5} />
            연결 끊김
          </span>
        )}
      </div>
      <div className="text-2xs text-text-faint mb-2">{tierMeta.desc}</div>

      {mounted ? (
        <>
          <div className="relative h-1.5 bg-surface rounded-full overflow-hidden mb-1.5">
            <div
              className={`absolute inset-y-0 left-0 ${tierMeta.barColor} ${
                warnPct === "bad" ? "!bg-rose-600" : warnPct === "warn" ? "!bg-amber-600" : ""
              }`}
              style={{ width: `${pct.toFixed(1)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="text-text-muted">
              사용{" "}
              <span className="font-semibold text-text">
                {formatBytes(volume.usedBytes)}
              </span>
              <span className="text-text-faint">
                {" "}
                / {formatBytes(volume.totalBytes)}
              </span>
            </span>
            <span
              className={`font-bold ${
                warnPct === "bad"
                  ? "text-danger"
                  : warnPct === "warn"
                    ? "text-amber-600"
                    : "text-text"
              }`}
            >
              {pct.toFixed(1)}%
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs text-text-faint italic">
          볼륨이 마운트되어 있지 않음
        </div>
      )}
    </div>
  );
}

function MirrorCard({ mirror }: { mirror: HealthSnapshot["mirror"] }) {
  if (!mirror) {
    return (
      <HealthCard
        icon={<Copy size={13} strokeWidth={2.3} />}
        title="미러 백업"
        statusText="미탐지"
        statusTone="bad"
      >
        <div className="text-xs text-text-faint">
          Vibox Mirror 볼륨 마운트 안 됨
        </div>
      </HealthCard>
    );
  }

  const ageMs =
    mirror.latestAt != null ? Date.now() - mirror.latestAt : Infinity;
  const tone = !mirror.launchdLoaded
    ? "warn"
    : mirror.latestAt == null
      ? "bad"
      : ageMs > 12 * 60 * 60 * 1000 // 12시간 이상 미실행
        ? "warn"
        : "ok";
  const label = !mirror.launchdLoaded
    ? "자동화 없음"
    : mirror.latestAt == null
      ? "스냅샷 없음"
      : tone === "warn"
        ? "지연"
        : "정상";

  return (
    <HealthCard
      icon={<Copy size={13} strokeWidth={2.3} />}
      title="미러 백업"
      statusText={label}
      statusTone={tone}
    >
      <div className="space-y-0.5 text-xs text-text-muted">
        <div>
          launchd:{" "}
          <span
            className={`font-semibold ${
              mirror.launchdLoaded ? "text-success" : "text-amber-700"
            }`}
          >
            {mirror.launchdLoaded ? "등록됨" : "미등록"}
          </span>
        </div>
        {mirror.latestDate ? (
          <div>
            최신 스냅샷:{" "}
            <span className="font-semibold text-text">{mirror.latestDate}</span>
            {mirror.latestAt != null && (
              <span className="text-text-faint">
                {" · "}
                {formatBackupAge(ageMs)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-text-faint">스냅샷 없음</div>
        )}
        <div>
          보관: <span className="font-semibold text-text tabular-nums">{mirror.snapshotCount}</span>개
          {" · "}
          <span className="font-semibold text-text tabular-nums">
            {formatBytes(mirror.totalBytes)}
          </span>
        </div>
        {mirror.lastLogTail && (
          <div
            className="text-2xs text-text-faint truncate"
            title={mirror.lastLogTail}
          >
            {mirror.lastLogTail}
          </div>
        )}
      </div>
    </HealthCard>
  );
}

function formatBackupAge(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 60_000) return "방금 전";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}시간 전`;
  return `${Math.floor(ms / 86400_000)}일 전`;
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function SystemStatusSection({
  system,
}: {
  system: SystemSnapshot | null;
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Gauge size={15} strokeWidth={2.3} className="text-text" />
          <h2 className="text-base font-bold text-text">시스템 실시간</h2>
          {system?.remoteHost ? (
            <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              SSH → {system.remoteHost}
            </span>
          ) : null}
          <span className="text-xs text-text-faint">2초 간격 갱신</span>
        </div>
        {system && (
          <div className="text-xs text-text-muted tabular-nums">
            가동: {formatUptime(system.uptimeSec)}
          </div>
        )}
      </div>

      {!system ? (
        <div className="text-sm text-text-faint italic">
          불러오는 중…
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* CPU */}
          <GaugeCard
            icon={<Cpu size={13} strokeWidth={2.3} />}
            label="CPU"
            valueText={`${Math.round(system.cpu.usage * 100)}%`}
            subText={`${system.cpu.cores}코어 · LA ${system.cpu.loadAvg[0].toFixed(2)}`}
            pct={system.cpu.usage * 100}
            tooltip={system.cpu.model}
          />

          {/* RAM */}
          <GaugeCard
            icon={<MemoryStick size={13} strokeWidth={2.3} />}
            label="메모리"
            valueText={`${Math.round(system.memory.pressure * 100)}%`}
            subText={`${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)}`}
            pct={system.memory.pressure * 100}
          />

          {/* 디스크 I/O — Vibox 스토리지 */}
          <DiskCard
            label="Vibox SSD"
            disk={system.disk.storage}
            fallbackNote="외장 SSD 인식 실패"
          />

          {/* 네트워크 */}
          <NetCard net={system.network} />
        </div>
      )}

      {system && system.disk.system && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs font-bold text-text-muted mb-1.5">
            참고 — 내장 디스크 ({system.disk.system.deviceName})
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-muted">I/O</span>
            <span className="text-text tabular-nums">
              {formatBytesPerSec(
                system.disk.system.readBytesPerSec +
                  system.disk.system.writeBytesPerSec,
              )}
            </span>
            <span className="text-text-faint tabular-nums">
              · {system.disk.system.tps.toFixed(0)} ops/s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function GaugeCard({
  icon,
  label,
  valueText,
  subText,
  pct,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  valueText: string;
  subText: string;
  pct: number;
  tooltip?: string;
}) {
  const color =
    pct > 90
      ? "bg-rose-500"
      : pct > 70
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div
      className="rounded-lg border border-border bg-surface px-3 py-2.5"
      title={tooltip}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-text-muted mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-text tabular-nums">
        {valueText}
      </div>
      <div className="h-1.5 bg-white rounded-full overflow-hidden mt-1.5 mb-1">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="text-2xs text-text-faint truncate">{subText}</div>
    </div>
  );
}

function DiskCard({
  label,
  disk,
  fallbackNote,
}: {
  label: string;
  disk: DiskIO | null;
  fallbackNote: string;
}) {
  if (!disk) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-text-muted mb-1">
          <HardDrive size={13} strokeWidth={2.3} />
          {label}
        </div>
        <div className="text-sm text-text-faint italic mt-1">
          {fallbackNote}
        </div>
      </div>
    );
  }
  const totalBps = disk.readBytesPerSec + disk.writeBytesPerSec;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-text-muted mb-1">
        <span className="flex items-center gap-1.5">
          <HardDrive size={13} strokeWidth={2.3} />
          {label}
        </span>
        <span className="text-text-faint font-mono font-normal text-2xs">
          {disk.deviceName}
        </span>
      </div>
      <div className="text-lg font-bold text-text tabular-nums">
        {formatBytesPerSec(totalBps)}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-0.5">
          <span className="text-blue-500">↓</span>
          <span className="tabular-nums">
            {formatBytesPerSec(disk.readBytesPerSec)}
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="text-amber-500">↑</span>
          <span className="tabular-nums">
            {formatBytesPerSec(disk.writeBytesPerSec)}
          </span>
        </span>
      </div>
      <div className="text-2xs text-text-faint mt-0.5 tabular-nums">
        {disk.tps.toFixed(0)} ops/s
      </div>
    </div>
  );
}

function NetCard({ net }: { net: SystemSnapshot["network"] }) {
  if (!net) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-text-muted mb-1">
          <Wifi size={13} strokeWidth={2.3} />
          네트워크
        </div>
        <div className="text-sm text-text-faint italic mt-1">
          측정 실패
        </div>
      </div>
    );
  }
  const total = net.rxBytesPerSec + net.txBytesPerSec;
  // 1Gbps = ~125MB/s. 사용률 기준
  const utilPct = Math.min(100, (total / (125 * 1024 * 1024)) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-text-muted mb-1">
        <span className="flex items-center gap-1.5">
          <Wifi size={13} strokeWidth={2.3} />
          네트워크
        </span>
        <span className="text-text-faint font-mono font-normal text-2xs">
          {net.interfaceName}
        </span>
      </div>
      <div className="text-lg font-bold text-text tabular-nums">
        {formatBytesPerSec(total)}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-0.5">
          <span className="text-blue-500">↓</span>
          <span className="tabular-nums">
            {formatBytesPerSec(net.rxBytesPerSec)}
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="text-amber-500">↑</span>
          <span className="tabular-nums">
            {formatBytesPerSec(net.txBytesPerSec)}
          </span>
        </span>
      </div>
      <div className="text-2xs text-text-faint mt-0.5 tabular-nums">
        기가비트 사용률 {utilPct.toFixed(1)}%
      </div>
    </div>
  );
}

function LiveCard({ bytesPerSec }: { bytesPerSec: number }) {
  const isHot = bytesPerSec > 10 * 1024 * 1024; // 10 MB/s 이상 = 활발
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isHot
          ? "bg-danger-soft border-rose-200 text-danger"
          : "bg-surface border-border text-text"
      }`}
    >
      <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1">
        <Activity size={10} strokeWidth={2.5} className={isHot ? "animate-pulse" : ""} />
        지금
      </div>
      <div className="text-xl font-bold tabular-nums">
        {formatBytesPerSec(bytesPerSec)}
      </div>
      <div className="text-xs opacity-70 mt-0.5">최근 1분 평균</div>
    </div>
  );
}

function StorageCard({
  storage,
}: {
  storage: StatsResponse["storage"];
}) {
  if (!storage) {
    return (
      <div className="bg-white border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <HardDrive size={14} strokeWidth={2.3} className="text-text" />
          <span className="text-base font-bold text-text">스토리지</span>
        </div>
        <div className="text-sm text-text-faint italic">측정 안 됨</div>
      </div>
    );
  }
  const usedPct =
    storage.totalBytes && storage.totalBytes > 0
      ? (storage.usedBytes / storage.totalBytes) * 100
      : 0;

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <HardDrive size={14} strokeWidth={2.3} className="text-text" />
        <span className="text-base font-bold text-text">스토리지</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[20px] font-bold text-text tabular-nums">
          {formatBytes(storage.usedBytes)}
        </span>
        {storage.totalBytes !== null && (
          <span className="text-sm text-text-muted">
            / {formatBytes(storage.totalBytes)} ({usedPct.toFixed(1)}%)
          </span>
        )}
      </div>
      {storage.totalBytes !== null && (
        <div className="h-2 bg-surface rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full ${
              usedPct > 90
                ? "bg-rose-500"
                : usedPct > 70
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, usedPct)}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{formatCount(storage.fileCount)}개 파일</span>
        {storage.freeBytes !== null && (
          <span>{formatBytes(storage.freeBytes)} 여유</span>
        )}
      </div>
    </div>
  );
}

function MonthlyLimitCard({
  limitTB,
  onChange,
  usage,
}: {
  limitTB: number;
  onChange: (v: number) => void;
  usage: number;
}) {
  const limitBytes = limitTB * 1024 ** 4;
  const pct = limitBytes > 0 ? Math.min(100, (usage / limitBytes) * 100) : 0;

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={2.3} className="text-text" />
          <span className="text-base font-bold text-text">월 트래픽 한도</span>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={limitTB}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange(n);
            }}
            className="w-14 border border-border rounded px-1 py-0.5 text-text tabular-nums text-right"
          />
          <span className="text-text-muted">TB</span>
        </label>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[20px] font-bold text-text tabular-nums">
          {formatBytes(usage)}
        </span>
        <span className="text-sm text-text-muted">
          / {formatBytes(limitBytes)} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-2xs text-text-faint mt-1.5">
        80% 도달 시 경고 배너 표시. 한도는 브라우저에 저장돼요.
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  bytes,
  count,
  accent,
}: {
  label: string;
  bytes: number;
  count: number;
  accent: "blue" | "green" | "violet" | "slate";
}) {
  const accentColors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-success-soft text-success border-emerald-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    slate: "bg-surface text-text-soft border-border",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${accentColors[accent]}`}>
      <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">
        {formatBytes(bytes)}
      </div>
      <div className="text-xs opacity-70 mt-0.5 tabular-nums">
        {formatCount(count)}회 요청
      </div>
    </div>
  );
}

function DailyChart({
  daily,
}: {
  daily: { day: string; bytes: number; count: number }[];
}) {
  const max = Math.max(1, ...daily.map((d) => d.bytes));
  const showLabels = daily.length <= 31;

  return (
    <div className="flex items-end gap-1 h-40">
      {daily.map((d) => {
        const heightPct = (d.bytes / max) * 100;
        const date = new Date(d.day);
        const label = `${date.getMonth() + 1}/${date.getDate()}`;
        return (
          <div
            key={d.day}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${d.day}\n${formatBytes(d.bytes)} · ${d.count}회`}
          >
            <div className="w-full flex-1 flex items-end">
              <div
                className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all"
                style={{
                  height: `${heightPct}%`,
                  minHeight: d.bytes > 0 ? "2px" : "0",
                }}
              />
            </div>
            {showLabels && (
              <div className="text-2xs text-text-muted whitespace-nowrap">
                {label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdown({
  bySource,
  total,
}: {
  bySource: { source: string; bytes: number; count: number }[];
  total: number;
}) {
  const outbound = bySource.filter((s) => s.source !== "upload");
  const outboundTotal = outbound.reduce((sum, s) => sum + s.bytes, 0) || 1;
  const upload = bySource.find((s) => s.source === "upload");

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-xs font-bold text-text-muted mb-1.5">
          아웃바운드 (사용자에게 전달)
        </div>
        <div className="flex h-3 rounded-md overflow-hidden bg-surface mb-2">
          {outbound.map((s) => {
            const meta =
              SOURCE_LABELS[s.source] ?? { label: s.source, color: "#94a3b8" };
            const w = (s.bytes / outboundTotal) * 100;
            return (
              <div
                key={s.source}
                style={{ width: `${w}%`, backgroundColor: meta.color }}
                title={`${meta.label}: ${formatBytes(s.bytes)}`}
              />
            );
          })}
        </div>
        <ul className="space-y-1 text-sm">
          {outbound.map((s) => {
            const meta =
              SOURCE_LABELS[s.source] ?? { label: s.source, color: "#94a3b8" };
            return (
              <li key={s.source} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="flex-1 text-text-muted">{meta.label}</span>
                <span className="text-text tabular-nums">
                  {formatBytes(s.bytes)}
                </span>
                <span className="text-text-faint tabular-nums text-xs w-12 text-right">
                  {formatCount(s.count)}회
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {upload && upload.bytes > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs font-bold text-text-muted mb-1.5">
            인바운드 (들어온 업로드)
          </div>
          <div className="flex items-center gap-2 text-sm">
            <UploadIcon
              size={11}
              strokeWidth={2.2}
              className="text-amber-500 shrink-0"
            />
            <span className="flex-1 text-text-muted">업로드</span>
            <span className="text-text tabular-nums">
              {formatBytes(upload.bytes)}
            </span>
            <span className="text-text-faint tabular-nums text-xs w-12 text-right">
              {formatCount(upload.count)}회
            </span>
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="text-sm text-text-faint italic">
          아직 기록 없음
        </div>
      )}
    </div>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: {
    key: string;
    label: string;
    sub?: string;
    href?: string;
    bytes: number;
    count: number;
  }[];
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <h2 className="text-base font-bold text-text mb-3">{title}</h2>
      {items.length === 0 ? (
        <div className="text-sm text-text-faint italic">
          아직 기록 없음
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const LabelEl = it.href ? Link : "span";
            return (
              <li
                key={it.key || i}
                className="flex items-center gap-2 text-sm"
              >
                <span className="font-mono text-2xs font-bold text-text-faint w-5 text-right shrink-0">
                  #{i + 1}
                </span>
                <LabelEl
                  href={it.href ?? "#"}
                  target={it.href ? "_blank" : undefined}
                  className={`flex-1 truncate ${
                    it.href ? "text-text hover:text-accent" : "text-text"
                  }`}
                  title={it.sub || it.label}
                >
                  {it.label}
                </LabelEl>
                <span className="text-text-soft tabular-nums shrink-0">
                  {formatBytes(it.bytes)}
                </span>
                <span className="text-text-faint tabular-nums text-xs shrink-0 w-10 text-right">
                  {formatCount(it.count)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-semibold text-text">{value}</dd>
    </div>
  );
}

function EncodingCard({
  encoding,
}: {
  encoding: HealthSnapshot["encoding"];
}) {
  const activeCount = encoding.active.length;
  const tone =
    encoding.failedCount > 0
      ? "warn"
      : activeCount > 0 || encoding.queuedCount > 0
        ? "ok"
        : "muted";
  const label =
    activeCount > 0
      ? `인코딩 ${activeCount}건`
      : encoding.queuedCount > 0
        ? `대기 ${encoding.queuedCount}건`
        : "유휴";
  return (
    <HealthCard
      icon={<Film size={13} strokeWidth={2.3} />}
      title="HLS 인코딩"
      statusText={label}
      statusTone={tone}
    >
      <div className="space-y-1 text-xs text-text-muted">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            동작{" "}
            <span className="font-semibold text-text tabular-nums">
              {activeCount}
            </span>
          </span>
          <span className="text-text-faint">·</span>
          <span>
            대기{" "}
            <span className="font-semibold text-text tabular-nums">
              {encoding.queuedCount}
            </span>
          </span>
          <span className="text-text-faint">·</span>
          <span>
            완료{" "}
            <span className="font-semibold text-success tabular-nums">
              {encoding.doneCount}
            </span>
          </span>
          {encoding.failedCount > 0 && (
            <>
              <span className="text-text-faint">·</span>
              <span>
                실패{" "}
                <span className="font-semibold text-danger tabular-nums">
                  {encoding.failedCount}
                </span>
              </span>
            </>
          )}
        </div>
        {encoding.totalAssets > 0 && (
          <div>
            HLS 자산{" "}
            <span className="font-semibold text-text tabular-nums">
              {encoding.totalAssets}
            </span>
            {" · "}
            <span className="font-semibold text-text tabular-nums">
              {formatBytes(encoding.totalAssetBytes)}
            </span>
          </div>
        )}
        {encoding.active.length > 0 && (
          <div className="space-y-0.5 pt-1 border-t border-border/40 mt-1">
            {encoding.active.map((j) => (
              <div key={j.id} className="flex items-center gap-2">
                <span
                  className="flex-1 truncate font-mono text-2xs text-text-soft"
                  title={j.filePath}
                >
                  {j.filePath.replace(/^\//, "")}
                </span>
                <div className="w-16 h-1.5 bg-surface-2 rounded overflow-hidden shrink-0">
                  <div
                    className="h-full bg-sky-500 transition-[width]"
                    style={{ width: `${j.progress}%` }}
                  />
                </div>
                <span className="font-semibold text-text tabular-nums w-9 text-right shrink-0">
                  {j.progress}%
                </span>
              </div>
            ))}
          </div>
        )}
        {encoding.recentFailed.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/40 mt-1">
            <div className="text-2xs font-semibold text-danger">
              최근 실패
            </div>
            {encoding.recentFailed.slice(0, 3).map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1.5"
                title={`${f.filePath}\n${f.error ?? ""}`}
              >
                <span className="font-mono text-2xs text-text-faint truncate flex-1 min-w-0">
                  {f.filePath.replace(/^\//, "")}
                </span>
                <button
                  onClick={async () => {
                    const r = await fetch(
                      `/api/admin/encode/${f.id}/retry`,
                      { method: "POST" },
                    );
                    if (!r.ok) {
                      alert("재시도 실패");
                      return;
                    }
                    // 차회 health 폴링이 알아서 갱신
                  }}
                  className="shrink-0 inline-flex items-center gap-0.5 text-2xs text-text-soft hover:text-accent px-1 py-0.5 rounded hover:bg-hover"
                  title="재시도"
                >
                  <RotateCcw size={10} strokeWidth={2.4} />
                  재시도
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </HealthCard>
  );
}
