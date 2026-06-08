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
  isPartner = false,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  /** 파트너(외부 편집자) 셸: 모바일 Bell·활동탭(내부 검수 큐 /inbox) 숨김 */
  isPartner?: boolean;
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
          {/* 파트너는 받은편지함(/inbox = 내부 검수 큐) 접근 X — 모바일 Bell 숨김 */}
          {!isPartner && (
            <Link
              href="/inbox"
              aria-label="받은편지함"
              className="p-2 relative rounded hover:bg-hover text-text"
            >
              <Bell size={19} strokeWidth={2.1} />
              {/* unread dot — 추후 실제 카운트 hook 으로 교체 */}
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent" />
            </Link>
          )}
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
                className="w-full bg-surface border border-transparent rounded-md pl-9 pr-3 py-2.5 text-[15px] outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-soft"
              />
            </div>
          </div>
        )}

        <div className="md:pb-0 pb-16">{children}</div>
      </main>

      {/* 모바일 Bottom Tab Bar — 홈·My box·비모·활동 (파트너는 활동 제외) */}
      <MobileTabBar pathname={pathname} isPartner={isPartner} />

      <CommandPalette />
      <ShortcutHelp />
      <InboxDesktopNotifier />
    </div>
  );
}

function MobileTabBar({ pathname, isPartner = false }: { pathname: string; isPartner?: boolean }) {
  const rail = railFromPath(pathname);
  type Tab = {
    key: typeof rail;
    href: string;
    label: string;
    Icon: typeof LayoutDashboard;
    tint?: string;
    /** 활성 알림 dot 표시 — 예: 활동 탭. 추후 unread count hook 으로 교체 */
    showDot?: boolean;
    /** lucide 아이콘 대신 vimo 투톤 마크 사용 (파트너 비모 — PC 사이드바 세그먼트와 일치) */
    mark?: boolean;
  };
  // 매니저(admin/member)·일반: 홈·My box·비모·활동
  const managerTabs: Tab[] = [
    { key: "home", href: "/", label: "홈", Icon: LayoutDashboard },
    { key: "mybox", href: "/my/box", label: "My box", Icon: Package, tint: "#0ea5e9" },
    { key: "team", href: "/team", label: "비모", Icon: Users, tint: "#e85008" },
    { key: "activity", href: "/inbox", label: "활동", Icon: Activity, showDot: true },
  ];
  // 파트너(외부 편집자): 홈·비모·보관함 — 사이드바 세그먼트와 순서·라벨 일치.
  // 활동(/inbox=내부 검수 큐) 없음. "비모"는 납품처인 Rendering 폴더로 직행.
  const partnerTabs: Tab[] = [
    { key: "home", href: "/", label: "홈", Icon: LayoutDashboard },
    { key: "team", href: "/team?path=/Rendering", label: "비모", Icon: Users, tint: "#e85008", mark: true },
    { key: "mybox", href: "/my/box", label: "보관함", Icon: Package, tint: "#0ea5e9" },
  ];
  const tabs = isPartner ? partnerTabs : managerTabs;
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border flex"
      style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      aria-label="모바일 메인 탭"
    >
      {tabs.map(({ key, href, label, Icon, tint, showDot, mark }) => {
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
              {mark ? (
                // 비모 = vimo 투톤 마크. 활성=풀컬러 / 비활성=회색(사이드바와 동일 처리)
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/vimo-mark.svg"
                  alt=""
                  style={{
                    height: 18,
                    width: "auto",
                    filter: active ? "none" : "saturate(0) opacity(0.5)",
                    transition: "filter .2s ease",
                  }}
                />
              ) : (
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              )}
              {showDot && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden
                />
              )}
            </span>
            <span
              className="text-[10px]"
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
