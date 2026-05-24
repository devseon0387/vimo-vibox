"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Star, FileText, Search } from "lucide-react";
import { listNotes, type NoteSummary } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { NoteList, EmptyState } from "@/components/NoteList";

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
    <Shell>
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">홈</h1>
            <p className="mt-1 text-xs text-zinc-500">⌘K 빠른 이동 · ⌘? 단축키</p>
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
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">불러오는 중…</div>
          ) : recent.length === 0 ? (
            <EmptyState message="아직 노트가 없습니다. ⌘+K 또는 [+ 새 글] 버튼으로 첫 글을 시작하세요." />
          ) : (
            <NoteList items={recent} />
          )}
        </section>
      </div>
    </Shell>
  );
}
