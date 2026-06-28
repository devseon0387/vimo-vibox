"use client";

import { useState, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Menu, Bell, Search, X, LayoutDashboard, Package, Users, Activity } from "lucide-react";
import { useEffect } from "react";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { InboxDesktopNotifier } from "./InboxDesktopNotifier";
import { railFromPath } from "@/lib/rail";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pathname = usePathname();
  const params = useSearchParams();

  // 경로가 바뀌면 drawer · 검색 자동 닫기
  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
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

  // 검색 열릴 때 자동 포커스
  useEffect(() => {
    if (searchOpen) {
      // 슬라이드 다운 직후 focus
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const submitSearch = () => {
    const t = searchValue.trim();
    if (t) router.push(`/?q=${encodeURIComponent(t)}`);
    else router.push("/");
    setSearchOpen(false);
  };

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
        {/* 모바일 헤더 — 햄버거 + (빈 공간) + 알림 벨(/inbox) + 검색 아이콘 */}
        <div className="md:hidden sticky top-0 bg-white border-b border-border z-30 px-3 py-2.5 flex items-center gap-1">
          <button
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
            className="p-2 rounded hover:bg-hover text-text"
          >
            <Menu size={20} strokeWidth={2.2} />
          </button>
          <div className="flex-1" />
          <Link
            href="/inbox"
            aria-label="받은편지함"
            className="p-2 relative rounded hover:bg-hover text-text"
          >
            <Bell size={19} strokeWidth={2.1} />
          </Link>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={searchOpen ? "검색 닫기" : "검색 열기"}
            aria-expanded={searchOpen}
            className="p-2 rounded hover:bg-hover text-text"
          >
            {searchOpen ? <X size={19} strokeWidth={2.2} /> : <Search size={19} strokeWidth={2.1} />}
          </button>
        </div>

        {/* 모바일 검색 슬라이드 다운 */}
        {searchOpen && (
          <div className="md:hidden sticky top-[48px] bg-white border-b border-border z-30 px-3 py-2 animate-[fade-in_0.15s_ease-out]">
            <div className="relative">
              <Search
                size={15}
                strokeWidth={2.2}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                ref={searchInputRef}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="파일 검색…"
                className="w-full bg-surface border border-transparent rounded-md pl-9 pr-3 py-2.5 text-lg outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-soft"
              />
            </div>
          </div>
        )}

        <div className="md:pb-0 pb-16">{children}</div>
      </main>

      {/* 모바일 Bottom Tab Bar — 홈·My box·비모·활동 */}
      <MobileTabBar pathname={pathname} />

      <CommandPalette />
      <ShortcutHelp />
      <InboxDesktopNotifier />
    </div>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const rail = railFromPath(pathname);
  const tabs: Array<{
    key: typeof rail;
    href: string;
    label: string;
    Icon: typeof LayoutDashboard;
    tint?: string;
    /** 활성 알림 dot 표시 — 예: 활동 탭. 추후 unread count hook 으로 교체 */
    showDot?: boolean;
  }> = [
    { key: "home", href: "/", label: "홈", Icon: LayoutDashboard },
    { key: "mybox", href: "/my/box", label: "My box", Icon: Package, tint: "#0ea5e9" },
    { key: "team", href: "/team", label: "비모", Icon: Users, tint: "#e85008" },
    { key: "activity", href: "/inbox", label: "활동", Icon: Activity },
  ];
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border flex"
      style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      aria-label="모바일 메인 탭"
    >
      {tabs.map(({ key, href, label, Icon, tint, showDot }) => {
        const active = rail === key;
        // 비활성 시 회색 통일 (Rail과 같은 위계 처리). 활성 시 tint 또는 accent.
        const color = active ? (tint ?? "var(--accent)") : "var(--text-soft)";
        return (
          <Link
            key={key}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{ color }}
          >
            <span className="relative inline-flex">
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {showDot && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden
                />
              )}
            </span>
            <span
              className="text-2xs"
              style={{ fontWeight: active ? 600 : 500 }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
