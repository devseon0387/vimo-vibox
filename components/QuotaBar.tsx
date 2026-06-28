import type { PersonalUsage } from "@/lib/fs/usage";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / Math.pow(1000, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/**
 * My Box 개인 드라이브 사용량 바 (presentational, 서버 렌더 가능).
 * 기존 my-box-client 의 쿼타 바 외관을 그대로 보존.
 */
export function QuotaBar({ usage }: { usage: PersonalUsage }) {
  const pct = Math.min(1, usage.pct) * 100;
  const pctTone =
    pct >= 95 ? "bg-danger" : pct >= 85 ? "bg-amber-500" : "bg-sky-500";

  return (
    <div className="mb-4 bg-white border border-border rounded-lg px-4 py-3">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-text-muted">
          사용{" "}
          <span className="font-semibold text-text tabular-nums">
            {formatBytes(usage.usedBytes)}
          </span>
          <span className="text-text-faint"> / {formatBytes(usage.quotaBytes)}</span>
          <span className="text-text-faint"> · {usage.fileCount}개 파일</span>
        </span>
        <span
          className={`font-bold tabular-nums ${pct >= 95 ? "text-danger" : pct >= 85 ? "text-amber-600" : "text-text-soft"}`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-1.5 bg-hover rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${pctTone} transition-all`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
