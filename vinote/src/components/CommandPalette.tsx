"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, FileText, ArrowRight } from "lucide-react";
import { listNotes, searchNotes, type NoteSummary, type SearchHit } from "@/lib/api";

type Item =
  | { kind: "action"; id: string; label: string; href: string; icon: React.ReactNode }
  | { kind: "note"; id: string; label: string; sub: string; href: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<NoteSummary[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setHits([]);
      listNotes({ limit: 15 }).then(setRecent);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const r = await searchNotes(q, 20);
      setHits(r);
      setActive(0);
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const items: Item[] = (() => {
    if (q.trim()) {
      const noteItems: Item[] = hits.map((h) => ({
        kind: "note" as const,
        id: h.path,
        label: h.title || "(제목 없음)",
        sub: h.snippet.replace(/\[\[|\]\]/g, ""),
        href: `/n/${encodeURIComponent(h.path)}`,
      }));
      // 액션: 검색 결과 페이지로 이동
      noteItems.unshift({
        kind: "action",
        id: "search-all",
        label: `"${q}" 검색 결과 모두 보기`,
        href: `/search?q=${encodeURIComponent(q)}`,
        icon: <Search size={14} />,
      });
      return noteItems;
    }
    // 빈 입력: 액션 + 최근
    const actions: Item[] = [
      { kind: "action", id: "new", label: "새 글", href: "/n/new", icon: <Plus size={14} /> },
      { kind: "action", id: "home", label: "홈", href: "/", icon: <ArrowRight size={14} /> },
      { kind: "action", id: "search", label: "검색", href: "/search", icon: <Search size={14} /> },
    ];
    const recentItems: Item[] = recent.map((n) => ({
      kind: "note" as const,
      id: n.path,
      label: n.title || "(제목 없음)",
      sub: n.folder ?? "",
      href: `/n/${encodeURIComponent(n.path)}`,
    }));
    return [...actions, ...recentItems];
  })();

  function go(item: Item) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((v) => Math.min(items.length - 1, v + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) go(it);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-lg border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <Search size={16} className="text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="노트 검색 또는 명령…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-500">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-zinc-400">결과 없음</li>
          )}
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.id}`}>
              <button
                onClick={() => go(it)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                  i === active ? "bg-zinc-100" : ""
                }`}
              >
                {it.kind === "action" ? (
                  <span className="text-zinc-500">{it.icon}</span>
                ) : (
                  <FileText size={14} className="text-zinc-400" />
                )}
                <span className="flex-1 truncate">{it.label}</span>
                {it.kind === "note" && it.sub && (
                  <span className="shrink-0 truncate text-[11px] text-zinc-400 max-w-[200px]">{it.sub}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400">
          ↑↓ 이동 · Enter 선택 · Esc 닫기
        </div>
      </div>
    </div>
  );
}
