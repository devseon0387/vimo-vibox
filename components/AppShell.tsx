"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useEffect } from "react";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { InboxDesktopNotifier } from "./InboxDesktopNotifier";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();

  // 경로가 바뀌면 drawer 자동 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname, params]);

  // drawer 열림 동안 body 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <div className="min-h-screen md:h-screen md:flex md:overflow-hidden">
      {/* Sidebar — 데스크톱에선 viewport 높이 고정, 모바일에선 fixed drawer */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50
          md:relative md:inset-y-auto md:left-auto md:z-auto md:h-screen md:shrink-0
          max-w-[88vw] md:max-w-none overflow-x-hidden
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0 shadow-xl md:shadow-none" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {sidebar}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main — 데스크톱에선 자체 스크롤, 모바일에선 body 스크롤 유지 */}
      <main className="flex-1 min-w-0 md:h-screen md:overflow-y-auto">
        <div className="md:hidden sticky top-0 bg-white border-b border-border z-30 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
            className="p-1.5 -ml-1 rounded hover:bg-hover text-text"
          >
            <Menu size={20} strokeWidth={2.2} />
          </button>
          <Link
            href="/"
            className="text-[15px] font-extrabold tracking-tight text-text"
          >
            vi<span className="text-accent">.</span>box
          </Link>
        </div>

        {children}
      </main>
      <CommandPalette />
      <ShortcutHelp />
      <InboxDesktopNotifier />
    </div>
  );
}
