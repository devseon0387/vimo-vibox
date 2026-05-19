"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Trash2,
  Link as LinkIcon,
  Users,
  Sparkles,
  HardDrive,
  BarChart3,
  Package,
  BookOpen,
  Film,
  Layers,
  Activity,
  Inbox,
  Building2,
} from "lucide-react";

import type { FeatureKey } from "@/lib/feature-badges";
import { NewBadge } from "./NewBadge";
import { useFeatureBadge } from "@/lib/feature-badges";

type NavItem = {
  label: string;
  icon: typeof FolderOpen;
  href: string;
  matchExact?: boolean;
  /** 신기능 NEW 배지를 위한 feature key */
  badge?: FeatureKey;
};

// VIMO Box 섹션 (팀 공용 + 받은편지함 + 검수 통계)
const vimoBoxItems: NavItem[] = [
  { label: "받은편지함", icon: Inbox, href: "/inbox" },
  { label: "렌더링", icon: Film, href: "/?path=/Rendering" },
  { label: "자료실", icon: BookOpen, href: "/vimo-box/library" },
  { label: "검수 통계", icon: Sparkles, href: "/insights" },
];

// 개인 섹션
const personalItems: NavItem[] = [
  { label: "내 박스", icon: Package, href: "/my/box" },
  { label: "내 기록", icon: Activity, href: "/my/stats", badge: "my-stats" },
];

// 일상 도구 (인사이트 분리됨)
const commonItems: NavItem[] = [
  { label: "클라이언트", icon: Building2, href: "/admin/clients", badge: "clients" },
  { label: "공유 링크", icon: LinkIcon, href: "/shares" },
  { label: "휴지통", icon: Trash2, href: "/trash" },
];

// 관리: 빈도 순 (트래픽 → 저장소 → 사용자)
const adminItems: NavItem[] = [
  { label: "트래픽 통계", icon: BarChart3, href: "/admin/stats" },
  { label: "저장소 정리", icon: HardDrive, href: "/admin/storage" },
  { label: "사용자 관리", icon: Users, href: "/admin/users" },
];

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof FolderOpen;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10.5px] font-bold tracking-widest text-text-faint uppercase">
      <Icon size={11} strokeWidth={2.3} />
      {label}
    </div>
  );
}

function NavRow({
  item,
  isActive,
  inboxCount,
}: {
  item: NavItem;
  isActive: boolean;
  inboxCount?: number;
}) {
  const Icon = item.icon;
  const badge = useFeatureBadge(item.badge ?? "shortcut-help");
  const showBadge = item.badge ? badge.show : false;
  return (
    <Link
      href={item.href}
      onClick={() => {
        if (item.badge) badge.markSeen();
      }}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] mb-0.5 transition-colors ${
        isActive
          ? "bg-accent-soft text-accent font-semibold"
          : "text-text-muted hover:bg-hover hover:text-text"
      }`}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-md bg-accent"
          aria-hidden
        />
      )}
      <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
      <span className="flex-1 truncate">{item.label}</span>
      {typeof inboxCount === "number" && inboxCount > 0 && (
        <span className="text-[10.5px] font-bold tabular-nums text-white bg-rose-500 rounded-full px-1.5 py-[1px] leading-tight">
          {inboxCount > 99 ? "99+" : inboxCount}
        </span>
      )}
      {showBadge && item.badge && <NewBadge feature={item.badge} />}
    </Link>
  );
}

export function SidebarNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const queryPath = params.get("path") ?? "/";

  // 받은편지함 카운트 (60초 폴링)
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/inbox");
        if (!r.ok) return;
        const data = (await r.json()) as { counts?: { total?: number } };
        if (!cancelled) setInboxCount(data.counts?.total ?? 0);
      } catch {}
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const isItemActive = (item: NavItem) => {
    // 렌더링: '/' 페이지에서 path=/Rendering 또는 그 하위일 때 active
    if (item.href === "/?path=/Rendering") {
      return (
        pathname === "/" &&
        (queryPath === "/Rendering" || queryPath.startsWith("/Rendering/"))
      );
    }
    // 자료실 등은 path 와 무관하게 pathname 기반
    const hrefPathOnly = item.href.split("?")[0];
    return pathname.startsWith(hrefPathOnly) && hrefPathOnly !== "/";
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 pt-1 pb-2">
      {/* VIMO Box 섹션 */}
      <SectionLabel icon={Layers} label="VIMO Box" />
      {vimoBoxItems.map((item) => (
        <NavRow
          key={item.href}
          item={item}
          isActive={isItemActive(item)}
          inboxCount={item.href === "/inbox" ? inboxCount ?? undefined : undefined}
        />
      ))}

      {/* 개인 */}
      <SectionLabel icon={Package} label="Personal" />
      {personalItems.map((item) => (
        <NavRow key={item.href} item={item} isActive={isItemActive(item)} />
      ))}

      {/* 일상 (공유·휴지통) */}
      <SectionLabel icon={FolderOpen} label="일상" />
      {commonItems.map((item) => (
        <NavRow key={item.href} item={item} isActive={isItemActive(item)} />
      ))}

      {/* 관리자 전용 */}
      {isAdmin && (
        <>
          <SectionLabel icon={HardDrive} label="관리" />
          {adminItems.map((item) => (
            <NavRow key={item.href} item={item} isActive={isItemActive(item)} />
          ))}
        </>
      )}
    </nav>
  );
}
