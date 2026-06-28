import Link from "next/link";
import { Inbox, Film, Users } from "lucide-react";
import type { InboxItem } from "@/lib/dashboard/queries";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

/** 매니저(admin/member) 한정 — 검수 대기 영상 목록. */
export function InboxCard({ items }: { items: InboxItem[] }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Inbox size={16} strokeWidth={2.2} className="text-text-soft" />
          받은편지함
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold tracking-tight"
            style={{ background: "var(--team-soft)", color: "var(--team-dark)" }}
          >
            <Users size={10} strokeWidth={2.4} />
            비모
          </span>
        </h3>
        <Link
          href="/inbox"
          className="text-xs text-text-soft hover:text-accent transition"
        >
          모두 →
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-text-faint py-3 text-center">
          검수 대기 영상이 없어요
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          {items.map((it) => (
            <Link
              key={it.path}
              href={`/vimo-box?path=${encodeURIComponent(it.path)}`}
              className="flex items-center gap-2 p-2 rounded bg-surface hover:bg-white hover:border-border-hover border border-transparent transition"
            >
              <Film size={14} strokeWidth={2} className="text-text-faint shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  <strong>{it.uploadedByName}</strong> · {it.filename}
                </div>
                <div className="text-text-faint text-2xs">{relativeTime(it.uploadedAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
