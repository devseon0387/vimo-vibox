"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Code2, Package, Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { railFromPath } from "@/lib/rail";

type RailItem = {
  key: "home" | "dev" | "mybox" | "admin";
  label: string;
  icon: typeof Home;
  href: string;
  adminOnly?: boolean;
};

const RAIL_ITEMS: RailItem[] = [
  { key: "home", label: "홈", icon: Home, href: "/" },
  { key: "dev", label: "개발", icon: Code2, href: "/dev/notes", adminOnly: true },
  { key: "mybox", label: "내 박스", icon: Package, href: "/my/box" },
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
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`
                relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg
                transition-colors
                ${isActive
                  ? "bg-white text-accent shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-text-soft hover:bg-hover"
                }
              `}
            >
              <Icon size={18} strokeWidth={2} />
              <span className="text-[11px] font-medium tracking-tight">
                {item.label}
              </span>
              {item.adminOnly && (
                <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-accent/50" />
              )}
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
