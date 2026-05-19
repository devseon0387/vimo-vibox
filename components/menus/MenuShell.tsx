"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/version";

/* ============================================================
   Menu shared building blocks (Variant A — Dropbox-style)
   ============================================================ */

export function MenuShell({
  title,
  headerExtra,
  children,
}: {
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <nav className="w-[240px] bg-white border-r border-border flex flex-col h-screen overflow-y-auto">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <span className="text-[16px] font-bold tracking-tight text-text">
          {title}
        </span>
        {headerExtra}
      </div>
      {children}
      <div className="mt-auto px-4 py-3 border-t border-[#f0ece9] shrink-0">
        <p
          className="text-[10px] font-bold text-[#d6cec8]"
          style={{ letterSpacing: "0.1em" }}
        >
          VIBOX{" "}
          <span className="font-medium text-[#e0d9d3]">{APP_VERSION}</span>
          <span className="font-normal text-[#e0d9d3] ml-1">
            · {APP_LAST_UPDATED}
          </span>
        </p>
      </div>
    </nav>
  );
}

export function MenuSearch({
  placeholder = "파일 검색",
}: {
  placeholder?: string;
}) {
  return (
    <button
      type="button"
      className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-md bg-surface text-text-faint hover:bg-hover transition-colors"
      onClick={() => {
        // Trigger CommandPalette (already wired with cmd+k)
        const e = new KeyboardEvent("keydown", { key: "k", metaKey: true });
        window.dispatchEvent(e);
      }}
    >
      <Search size={13} strokeWidth={2.2} />
      <span className="text-[12.5px]">{placeholder}</span>
      <kbd className="ml-auto text-[10px] px-1.5 py-px bg-white border border-border rounded text-text-faint font-sans">
        ⌘K
      </kbd>
    </button>
  );
}

export function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-semibold tracking-widest text-text-faint uppercase">
      {label}
    </div>
  );
}

type MenuItemProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string | number;
  matchExact?: boolean;
  matchPrefix?: string;
  matchQueryPath?: string; // /?path=/Rendering 같은 경우 사용
  indent?: 1 | 2;
};

export function MenuItem({
  href,
  icon: Icon,
  label,
  badge,
  matchExact,
  matchPrefix,
  matchQueryPath,
  indent,
}: MenuItemProps) {
  const pathname = usePathname();
  const params = useSearchParams();

  let isActive = false;
  if (matchQueryPath) {
    const p = params.get("path") || "";
    isActive = pathname === "/" && p === matchQueryPath;
  } else if (matchExact) {
    isActive = pathname === href.split("?")[0];
  } else if (matchPrefix) {
    isActive = pathname.startsWith(matchPrefix);
  } else {
    isActive = pathname === href.split("?")[0];
  }

  const padLeft = indent === 2 ? "pl-11" : indent === 1 ? "pl-7" : "pl-3";

  return (
    <Link
      href={href}
      className={`
        mx-2 my-px flex items-center gap-2.5 ${padLeft} pr-3 py-1.5 rounded-md
        text-[13.5px] transition-colors
        ${isActive
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-soft hover:bg-surface"
        }
      `}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0 opacity-90" />
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={`ml-auto text-[11px] ${
            isActive ? "text-accent" : "text-text-faint"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

/* CommandPalette open via cmd+k — wire from MenuSearch */
export function MenuSearchKeyHandler() {
  // No-op shell; CommandPalette listens to cmd+k itself.
  // Kept here for potential future expansion.
  useEffect(() => {}, []);
  return null;
}
