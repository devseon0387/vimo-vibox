"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  FolderOpen,
  Trash2,
  Link as LinkIcon,
  Users,
  Sparkles,
} from "lucide-react";

const baseItems = [
  { label: "파일", icon: FolderOpen, href: "/" },
  { label: "휴지통", icon: Trash2, href: "/trash" },
  { label: "공유 링크", icon: LinkIcon, href: "/shares" },
  { label: "인사이트", icon: Sparkles, href: "/insights" },
] as const;

const adminItems = [
  { label: "사용자 관리", icon: Users, href: "/admin/users" },
] as const;

export function SidebarNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const queryPath = params.get("path") ?? "/";

  const items = isAdmin ? [...baseItems, ...adminItems] : baseItems;

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/"
            ? pathname === "/" && queryPath === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] mb-0.5 transition-colors ${
              isActive
                ? "bg-accent-soft text-accent font-semibold"
                : "text-text-muted hover:bg-hover hover:text-text"
            }`}
          >
            <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
            <span className="flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
