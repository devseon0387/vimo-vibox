"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { searchNotes, type SearchHit } from "@/lib/api";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await searchNotes(q, 30);
      setHits(r);
      setLoading(false);
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
        <ArrowLeft size={12} /> 홈
      </Link>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
        <Search size={16} className="text-zinc-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="노트 본문 검색…"
          className="flex-1 bg-transparent text-base outline-none"
        />
      </div>

      <div className="mt-6">
        {loading && q && <div className="text-xs text-zinc-400">검색 중…</div>}
        {!loading && q && hits.length === 0 && (
          <div className="text-sm text-zinc-500">검색 결과 없음</div>
        )}
        <ul className="grid gap-1">
          {hits.map((h) => (
            <li key={h.path}>
              <Link
                href={`/n/${encodeURIComponent(h.path)}`}
                className="block rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-400"
              >
                <div className="font-medium">{h.title || "(제목 없음)"}</div>
                <div
                  className="mt-1 text-xs text-zinc-600"
                  dangerouslySetInnerHTML={{
                    __html: h.snippet
                      .replace(/\[\[/g, '<mark class="bg-amber-100 text-amber-900 not-italic">')
                      .replace(/\]\]/g, "</mark>"),
                  }}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
