"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home, Search, Plus, Star, Inbox, FolderTree, Tag, PanelLeft,
} from "lucide-react";
import { getFacets, type Facets } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const [facets, setFacets] = useState<Facets | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFacets().then((f) => {
      if (!cancelled) setFacets(f);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white px-2 py-3">
      <div className="px-2">
        <Link href="/" className="block text-sm font-bold tracking-tight">
          비노트
        </Link>
      </div>

      <nav className="mt-4 grid gap-0.5">
        <Item href="/" icon={<Home size={14} />} label="홈" active={pathname === "/"} />
        <Item href="/n/new" icon={<Plus size={14} />} label="새 글" />
        <Item href="/search" icon={<Search size={14} />} label="검색" active={pathname === "/search"} />
      </nav>

      <Section icon={<Inbox size={11} />} label="컬렉션" />
      <Item
        href="/all"
        icon={<FolderTree size={14} />}
        label="모든 노트"
        sub={facets?.total ?? "—"}
        active={pathname === "/all"}
      />
      <Item
        href="/folder/_inbox"
        icon={<Inbox size={14} />}
        label="인박스"
        sub={facets?.folders.find((f) => f.name === "/_inbox")?.n ?? 0}
        active={pathname === "/folder/_inbox"}
      />
      <Item
        href="/starred"
        icon={<Star size={14} />}
        label="즐겨찾기"
        sub={facets?.starred ?? 0}
        active={pathname === "/starred"}
      />

      {facets && facets.folders.length > 0 && (
        <>
          <Section icon={<FolderTree size={11} />} label="폴더" />
          {facets.folders
            .filter((f) => f.name !== "/_inbox")
            .map((f) => {
              const slug = f.name.replace(/^\//, "");
              return (
                <Item
                  key={f.name}
                  href={`/folder/${encodeURIComponent(slug)}`}
                  label={slug || "(루트)"}
                  sub={f.n}
                  indent
                  active={pathname === `/folder/${encodeURIComponent(slug)}`}
                />
              );
            })}
        </>
      )}

      {facets && facets.tags.length > 0 && (
        <>
          <Section icon={<Tag size={11} />} label="태그" />
          {facets.tags.slice(0, 20).map((t) => (
            <Item
              key={t.name}
              href={`/tag/${encodeURIComponent(t.name)}`}
              label={`#${t.name}`}
              sub={t.n}
              indent
              active={pathname === `/tag/${encodeURIComponent(t.name)}`}
            />
          ))}
        </>
      )}

      <div className="mt-auto pt-4 text-[10px] text-zinc-400 px-2">
        <PanelLeft size={10} className="inline" /> ⌘\ 접기 · ⌘K 빠른 이동 · ⌘? 단축키
      </div>
    </aside>
  );
}

function Item({
  href, icon, label, sub, indent, active,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  sub?: string | number;
  indent?: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded px-2 py-1 text-[13px] transition ${
        indent ? "pl-5" : ""
      } ${active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
    >
      {icon && <span className={active ? "text-white" : "text-zinc-400"}>{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {sub !== undefined && (
        <span className={`shrink-0 text-[10px] ${active ? "opacity-70" : "text-zinc-400"}`}>
          {sub}
        </span>
      )}
    </Link>
  );
}

function Section({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mt-5 mb-1 inline-flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
      {icon} {label}
    </div>
  );
}
