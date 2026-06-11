"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Search, LogOut, type LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { MenuRouter } from "@/components/menus/MenuRouter";

/**
 * 파트너 전용 세그먼트 사이드바 (시안 1 채택).
 * 232px 단일 컬럼: 로고 · 검색 · 3분할 세그먼트(홈/비모/보관함) · 공간 CTA · 활성 섹션 · 유저 푸터.
 * "비모" 세그먼트는 비모 투톤 마크(/vimo-mark.svg, 왼쪽 진한·오른쪽 연한)를 아이콘으로 쓴다.
 * (이전 PartnerShell의 미니멀 상단바를 대체. 공간 전환을 사이드바가 담당.)
 */
type SpaceKey = "home" | "team" | "mybox";

function activeKey(pathname: string): SpaceKey {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/my")) return "mybox";
  return "home";
}

export function PartnerSidebar({
  userName,
  initials,
}: {
  userName: string;
  initials: string;
}) {
  const pathname = usePathname();
  const active = activeKey(pathname);
  const activeIdx = active === "home" ? 0 : active === "team" ? 1 : 2;

  const seg = (
    key: SpaceKey,
    label: string,
    tint: string,
    opts: { icon?: LucideIcon; href: string; mark?: boolean }
  ) => {
    const on = active === key;
    const Icon = opts.icon;
    return (
      <Link
        key={key}
        href={opts.href}
        className="relative z-10 flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors duration-300"
        style={on ? { color: tint, fontWeight: 700 } : { color: "var(--text-soft)", fontWeight: 500 }}
      >
        {opts.mark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/vimo-mark.svg"
            alt="비모"
            style={{
              width: 18,
              height: "auto",
              filter: on ? "none" : "saturate(0) opacity(0.45)",
              transform: on ? "scale(1.1)" : "scale(1)",
              transition: "filter var(--pa-dur) var(--pa-ease), transform var(--pa-dur) var(--pa-ease)",
            }}
          />
        ) : Icon ? (
          <Icon size={17} strokeWidth={2} />
        ) : null}
        <span className="text-[10.5px] tracking-tight leading-none">{label}</span>
      </Link>
    );
  };

  return (
    <div className="w-[232px] bg-white border-r border-border flex flex-col h-screen">
      {/* 로고 */}
      <Link
        href="/"
        className="px-4 pt-5 pb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Image src="/logo.png" alt="Vibox" width={28} height={28} priority className="rounded" />
        <span className="text-[16px] font-bold tracking-tight text-text">비박스</span>
      </Link>

      {/* 검색 (홈으로) */}
      <Link
        href="/?focus=search"
        className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface text-text-faint text-[12.5px] hover:bg-hover transition-colors"
      >
        <Search size={14} strokeWidth={2} /> 검색
      </Link>

      {/* 세그먼트 컨트롤 — 공간 전환 */}
      <div className="mx-3 mb-2 relative flex items-stretch p-1 rounded-xl bg-surface">
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          style={{
            left: "0.25rem",
            width: "calc((100% - 0.5rem) / 3)",
            transform: `translateX(calc(${activeIdx} * 100%))`,
            transition: "transform var(--pa-dur) var(--pa-ease)",
          }}
        />
        {seg("home", "홈", "var(--accent)", { icon: LayoutDashboard, href: "/" })}
        {seg("team", "비모", "#e85008", { href: "/team?path=/Rendering", mark: true })}
        {seg("mybox", "보관함", "#0ea5e9", { icon: Package, href: "/my/box" })}
      </div>

      {/* 활성 공간 섹션 — 공간(홈/비모/보관함) 전환에 따라 자동 변경 */}
      <div className="flex-1 overflow-y-auto pb-2">
        <MenuRouter isAdmin={false} isPartner />
      </div>

      {/* 푸터: 유저 · 로그아웃 */}
      <div className="mt-auto border-t border-border px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-[#C8430A] text-white grid place-items-center text-[12px] font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-text truncate">{userName || "파트너"}</div>
          <div className="text-[11px] text-text-faint truncate">외부 편집자 · 파트너</div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="로그아웃"
            className="p-1.5 rounded-md text-text-faint hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  );
}

