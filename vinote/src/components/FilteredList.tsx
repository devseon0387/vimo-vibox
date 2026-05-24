"use client";

import { useEffect, useState } from "react";
import { listNotes, type NoteSummary } from "@/lib/api";
import { Shell } from "./Shell";
import { NoteList, EmptyState } from "./NoteList";

export function FilteredList({
  title,
  subtitle,
  filter,
}: {
  title: string;
  subtitle?: string;
  filter: { folder?: string; tag?: string; starred?: boolean };
}) {
  const [items, setItems] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listNotes({ ...filter, limit: 200 }).then((rs) => {
      if (cancelled) return;
      setItems(rs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.folder, filter.tag, filter.starred]);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
        </header>
        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">불러오는 중…</div>
        ) : items.length === 0 ? (
          <EmptyState message="해당하는 노트가 없습니다." />
        ) : (
          <NoteList items={items} />
        )}
      </div>
    </Shell>
  );
}
