import Link from "next/link";
import { MessageCircle, ChevronRight } from "lucide-react";
import type { MyNewComment } from "@/lib/dashboard/queries";
import { SpaceLabel } from "./SpaceLabel";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function commentHref(filePath: string): string {
  return `/vimo-box?path=${encodeURIComponent(filePath)}`;
}

export function NewCommentsCard({ comments }: { comments: MyNewComment[] }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold flex items-center gap-2">
          <MessageCircle size={16} strokeWidth={2.2} className="text-accent" />
          내 작업에 달린 새 코멘트
          {comments.length > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {comments.length}
            </span>
          )}
        </h3>
      </div>
      {comments.length === 0 ? (
        <div className="text-sm text-text-faint py-4 text-center">
          24시간 내 새 코멘트가 없어요
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <Link
              key={c.id}
              href={commentHref(c.filePath)}
              className="flex items-start gap-2.5 py-1.5 border-b border-border last:border-0 hover:bg-surface -mx-1 px-1 rounded transition"
            >
              <div
                className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-700 grid place-items-center text-white text-xs font-bold shrink-0"
                aria-hidden
              >
                {initials(c.authorName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm flex items-center gap-1">
                  <strong className="truncate">{c.authorName}</strong>
                  <SpaceLabel space={c.space} size="sm" withText={false} />
                  <span className="text-text-faint">· {relativeTime(c.createdAt)}</span>
                </div>
                <div className="text-xs text-text-soft mt-0.5 truncate">
                  {c.filename}: &quot;{c.body}&quot;
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
