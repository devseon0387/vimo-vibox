"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search, Star, FileText } from "lucide-react";
import { listNotes, type NoteSummary } from "@/lib/api";

export default function HomePage() {
  const [recent, setRecent] = useState<NoteSummary[]>([]);
  const [starred, setStarred] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listNotes({ limit: 10 }), listNotes({ starred: true, limit: 8 })])
      .then(([r, s]) => {
        if (cancelled) return;
        setRecent(r);
        setStarred(s);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">비노트</h1>
          <p className="mt-1 text-xs text-zinc-500">글쓰기 전용 컴패니언</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:border-zinc-400"
          >
            <Search size={14} /> 검색
          </Link>
          <Link
            href="/n/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            <Plus size={14} /> 새 글
          </Link>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {starred.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <Star size={11} /> 즐겨찾기
          </h2>
          <NoteList items={starred} />
        </section>
      )}

      <section>
        <h2 className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          <FileText size={11} /> 최근
        </h2>
        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">
            불러오는 중…
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            아직 노트가 없습니다. 위의 [+ 새 글] 버튼으로 첫 글을 시작하세요.
          </div>
        ) : (
          <NoteList items={recent} />
        )}
      </section>
    </div>
  );
}

function NoteList({ items }: { items: NoteSummary[] }) {
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

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
