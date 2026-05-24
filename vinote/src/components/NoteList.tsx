import Link from "next/link";
import type { NoteSummary } from "@/lib/api";

export function NoteList({ items }: { items: NoteSummary[] }) {
  return (
    <ul className="grid gap-1">
      {items.map((n) => (
        <li key={n.path}>
          <Link
            href={`/n/${encodeURIComponent(n.path)}`}
            className="block rounded-lg border border-zinc-200 bg-white p-3 transition hover:border-zinc-400"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{n.title || "(제목 없음)"}</div>
              <span className="text-xs text-zinc-400">{relativeTime(n.mtimeMs)}</span>
            </div>
            {n.excerpt && (
              <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{n.excerpt}</div>
            )}
            {n.folder && n.folder !== "/" && (
              <div className="mt-1 text-[10px] text-zinc-400">{n.folder}</div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

export function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
