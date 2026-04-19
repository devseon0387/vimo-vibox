"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Clock,
  Star,
  Trash2,
  User,
  Users,
  Folder,
  Share2,
  Link as LinkIcon,
  type LucideIcon,
} from "lucide-react";
import { navSections } from "@/lib/mock-data";

const iconMap: Record<string, LucideIcon> = {
  Clock,
  Star,
  Trash2,
  User,
  Users,
  Folder,
  Share2,
  Link: LinkIcon,
};

export function SidebarNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const currentQueryPath = params.get("path") ?? "/";

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {navSections.map((section) => (
        <div key={section.label} className="mb-3">
          <div className="px-3 py-2 text-[11px] font-bold text-text-faint tracking-wider uppercase">
            {section.label}
          </div>
          {section.items.map((item) => {
            const Icon = iconMap[item.icon] ?? Folder;
            const isActive =
              pathname === item.href ||
              (pathname === "/" && item.href === "/" && currentQueryPath === "/");
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] mb-0.5 transition-colors ${
                  isActive
                    ? "bg-accent-soft text-accent font-semibold"
                    : "text-text-muted hover:bg-hover hover:text-text"
                }`}
              >
                <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.count !== undefined && (
                  <span className="text-[11px] text-text-faint font-medium">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
