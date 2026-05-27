"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Users, Activity, Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { railFromPath, type RailKey } from "@/lib/rail";

type RailItem = {
  key: RailKey;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  adminOnly?: boolean;
  /** 활성 아이콘 색상 (액티브 + 호버) — 공간 구분용 */
  accentColor?: string;
};

const RAIL_ITEMS: RailItem[] = [
  { key: "home", label: "홈", icon: LayoutDashboard, href: "/" },
  { key: "mybox", label: "My box", icon: Package, href: "/my/box", accentColor: "#0ea5e9" },
  { key: "team", label: "비모", icon: Users, href: "/team", accentColor: "#e85008" },
  { key: "activity", label: "활동", icon: Activity, href: "/inbox" },
  { key: "admin", label: "관리", icon: Settings, href: "/admin/users", adminOnly: true },
];

export function Rail({
  isAdmin,
  userInitials,
}: {
  isAdmin: boolean;
  userInitials: string;
}) {
  const pathname = usePathname();
  const active = railFromPath(pathname);

  const visibleItems = RAIL_ITEMS.filter((it) => !it.adminOnly || isAdmin);

  return (
    <aside className="w-[84px] bg-surface border-r border-border flex flex-col py-4 px-2 shrink-0 h-screen">
      {/* 비박스 로고 */}
      <Link
        href="/"
        title="Vibox 홈"
        className="mx-auto mb-4 mt-1 block hover:opacity-80 transition-opacity"
      >
        <Image
          src="/logo.png"
          alt="Vibox"
          width={36}
          height={36}
          priority
          className="rounded"
        />
      </Link>

      <nav className="flex flex-col gap-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          // 공간 구분 색은 활성일 때만. 비활성은 text-soft 통일 — 활성 위계 회복.
          const tint = item.accentColor;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`
                relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg
                transition-colors
                ${isActive
                  ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-text-soft hover:bg-hover hover:text-text"
                }
              `}
              style={isActive ? { color: tint ?? "var(--accent)" } : undefined}
            >
              <Icon size={18} strokeWidth={2} />
              <span className="text-[11px] font-medium tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <form action={logoutAction}>
          <button
            type="submit"
            title="로그아웃"
            className="p-2 rounded-md text-text-faint hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <LogOut size={14} strokeWidth={2} />
          </button>
        </form>
        <div
          title="내 계정"
          className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-[#C8430A] text-white grid place-items-center text-[12px] font-bold"
        >
          {userInitials}
        </div>
      </div>
    </aside>
  );
}
