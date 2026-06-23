import Link from "next/link";
import { Link2, Plus } from "lucide-react";
import type { MyShareActivity } from "@/lib/dashboard/queries";
import { SpaceLabel } from "./SpaceLabel";

function relativeTime(ms: number | null): string {
  if (!ms) return "조회 없음";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

export function ShareActivityCard({ shares }: { shares: MyShareActivity[] }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Link2 size={16} strokeWidth={2.2} className="text-accent" />
          내 공유 활동
        </h3>
        <Link
          href="/shares"
          className="text-xs text-text-soft hover:text-accent transition"
        >
          관리 →
        </Link>
      </div>
      {shares.length === 0 ? (
        <div className="text-sm text-text-faint py-4 text-center">
          아직 공유 링크가 없어요
        </div>
      ) : (
        <div className="space-y-1.5">
          {shares.map((s) => (
            <div
              key={s.token}
              className="flex items-center gap-2 py-1.5 border-b border-border last:border-0"
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: s.totalViews > 0 ? "var(--accent)" : "var(--text-faint)" }}
              />
              <SpaceLabel space={s.space} size="sm" withText={false} />
              <div className="text-sm flex-1 truncate">
                <strong>{s.title ?? s.filename}</strong>
                {" · "}
                <span className="text-text-soft">{s.totalViews}회 조회</span>
              </div>
              <span className="text-xs text-text-faint shrink-0">{relativeTime(s.lastViewedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
