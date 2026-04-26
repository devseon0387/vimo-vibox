"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Folder as FolderIcon,
  FileVideo,
  FileImage,
  FileText,
  FileAudio,
  File as FileIcon,
  Compass,
  ArrowRight,
} from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";

type SearchResult = FileEntry;

type StaticItem = {
  kind: "page";
  label: string;
  href: string;
  group: string;
};

type ResultItem =
  | { kind: "file"; entry: SearchResult }
  | StaticItem;

const STATIC_PAGES: StaticItem[] = [
  { kind: "page", label: "VIMO Box", href: "/vimo-box", group: "이동" },
  { kind: "page", label: "자료실", href: "/vimo-box/library", group: "이동" },
  { kind: "page", label: "내 박스", href: "/my/box", group: "이동" },
  { kind: "page", label: "내 기록", href: "/my/stats", group: "이동" },
  { kind: "page", label: "공유 링크 관리", href: "/shares", group: "이동" },
  { kind: "page", label: "휴지통", href: "/trash", group: "이동" },
  { kind: "page", label: "트래픽 통계", href: "/admin/stats", group: "관리" },
  { kind: "page", label: "스토리지 관리", href: "/admin/storage", group: "관리" },
  { kind: "page", label: "사용자 관리", href: "/admin/users", group: "관리" },
  { kind: "page", label: "검수 인사이트", href: "/insights", group: "도구" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 글로벌 ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 열리면 input 포커스 + 상태 리셋
  useEffect(() => {
    if (open) {
      setQuery("");
      setFiles([]);
      setActiveIdx(0);
      // requestAnimationFrame 으로 모달 mount 후 포커스
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // 검색 (250ms debounce)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const r = await fetch(
          `/api/files/search?q=${encodeURIComponent(q)}`,
          { signal: ac.signal },
        );
        if (!r.ok) throw new Error("search failed");
        const data = (await r.json()) as { results: SearchResult[] };
        setFiles(data.results.slice(0, 30));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFiles([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, query]);

  // 통합 결과 (정적 페이지 필터 + 파일)
  const items = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const out: ResultItem[] = [];
    if (!q) {
      for (const p of STATIC_PAGES) out.push(p);
      return out;
    }
    const matchedPages = STATIC_PAGES.filter((p) =>
      p.label.toLowerCase().includes(q),
    );
    for (const p of matchedPages) out.push(p);
    for (const f of files) out.push({ kind: "file", entry: f });
    return out;
  }, [files, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [items.length]);

  const openItem = useCallback(
    (it: ResultItem) => {
      setOpen(false);
      if (it.kind === "page") {
        router.push(it.href);
      } else {
        // 파일·폴더: 폴더면 폴더 진입, 파일이면 단일 검수 모달 페이지
        const e = it.entry;
        const zonePrefix = e.path.startsWith("/library")
          ? "/vimo-box/library"
          : e.path.startsWith("/personal")
            ? "/my/box"
            : "/vimo-box";
        if (e.isFolder) {
          // /vimo-box?path=/foo 형태
          const sub = e.path
            .replace(/^\/library/, "")
            .replace(/^\/personal\/[^/]+/, "");
          router.push(`${zonePrefix}${sub ? `?path=${encodeURIComponent(sub)}` : ""}`);
        } else {
          router.push(`/v?path=${encodeURIComponent(e.path)}`);
        }
      }
    },
    [router],
  );

  // 키보드 네비
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[activeIdx];
        if (it) openItem(it);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, activeIdx, openItem]);

  // 활성 항목 스크롤 인뷰
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  // 그룹핑
  const grouped: { title: string; items: { item: ResultItem; idx: number }[] }[] =
    [];
  let currentGroup: string | null = null;
  items.forEach((it, idx) => {
    const g =
      it.kind === "page"
        ? it.group
        : it.entry.isFolder
          ? "폴더"
          : "파일";
    if (g !== currentGroup) {
      grouped.push({ title: g, items: [] });
      currentGroup = g;
    }
    grouped[grouped.length - 1].items.push({ item: it, idx });
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[600px] bg-white rounded-xl shadow-2xl overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} strokeWidth={2} className="text-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="파일·폴더·페이지 검색…"
            className="flex-1 outline-none text-[14.5px] text-text placeholder:text-text-faint bg-transparent"
          />
          <kbd className="text-[10.5px] font-mono text-text-faint bg-surface border border-border rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-text-faint">
              검색 중…
            </div>
          )}
          {!loading && items.length === 0 && query.trim() && (
            <div className="px-4 py-8 text-center text-[13px] text-text-faint">
              결과가 없어요
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.title} className="py-1">
              <div className="px-4 pt-2 pb-1 text-[10.5px] font-bold text-text-faint uppercase tracking-wider">
                {g.title}
              </div>
              {g.items.map(({ item, idx }) => (
                <button
                  key={idx}
                  data-idx={idx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => openItem(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left ${
                    activeIdx === idx ? "bg-accent-soft" : "hover:bg-hover"
                  }`}
                >
                  <span className="shrink-0">
                    {item.kind === "page" ? (
                      <Compass size={16} strokeWidth={2} className="text-text-soft" />
                    ) : (
                      <KindIcon entry={item.entry} />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] text-text truncate">
                      {item.kind === "page" ? item.label : item.entry.name}
                    </span>
                    {item.kind === "file" && (
                      <span className="block text-[11px] text-text-faint truncate font-mono">
                        {item.entry.path}
                      </span>
                    )}
                  </span>
                  {activeIdx === idx && (
                    <ArrowRight
                      size={14}
                      strokeWidth={2.2}
                      className="text-accent shrink-0"
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-border bg-surface px-4 py-2 flex items-center gap-3 text-[10.5px] text-text-faint">
          <span>
            <kbd className="font-mono bg-white border border-border rounded px-1 py-0.5 mr-1">↑↓</kbd>
            이동
          </span>
          <span>
            <kbd className="font-mono bg-white border border-border rounded px-1 py-0.5 mr-1">↵</kbd>
            열기
          </span>
          <span className="ml-auto">
            <kbd className="font-mono bg-white border border-border rounded px-1 py-0.5 mr-1">⌘K</kbd>
            팔레트 토글
          </span>
        </div>
      </div>
    </div>
  );
}

function KindIcon({ entry }: { entry: SearchResult }) {
  const cls = "text-text-soft";
  if (entry.isFolder) return <FolderIcon size={16} strokeWidth={2} className={cls} />;
  if (entry.kind === "video") return <FileVideo size={16} strokeWidth={2} className={cls} />;
  if (entry.kind === "image") return <FileImage size={16} strokeWidth={2} className={cls} />;
  if (entry.kind === "audio") return <FileAudio size={16} strokeWidth={2} className={cls} />;
  if (entry.kind === "doc") return <FileText size={16} strokeWidth={2} className={cls} />;
  return <FileIcon size={16} strokeWidth={2} className={cls} />;
}
