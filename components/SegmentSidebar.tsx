"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Activity,
  Upload,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { railFromPath, type RailKey } from "@/lib/rail";
import { MenuSearch } from "./menus/MenuShell";
import { MenuRouter } from "./menus/MenuRouter";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/version";

/**
 * 단일 컬럼(232px) 매니저 사이드바 — 세그먼트 컨트롤 + 공간별 컬러 CTA.
 * 기존 Rail(84px 세로) + MenuRouter(240px) 2단(324px)을 하나로 합쳐 폭 절약 + 시선 점프 제거.
 * - 상단: 로고 · 검색 · 4분할 세그먼트(홈/My box/비모/활동) · 활성 공간 컬러 CTA
 * - 중단: 활성 공간 섹션 목록(MenuRouter, 스크롤)
 * - 하단: 유저 · 관리 톱니(admin) · 로그아웃
 * 관리(admin)는 4분할에 안 들어가 하단 톱니로 진입. (시안: 세그먼트 컨트롤 사이드바 + v6 컬러 CTA)
 */

type Space = {
  key: RailKey;
  label: string;
  icon: LucideIcon;
  href: string;
  /** 활성 색 (공간 구분). 없으면 기본 accent */
  tint?: string;
  /** 알림 dot (활동) */
  dot?: boolean;
  /** 공간별 컬러 CTA — 잦은 업로드 동선 */
  cta?: { label: string; href: string; color: string };
};

const SPACES: Space[] = [
  {
    key: "home",
    label: "홈",
    icon: LayoutDashboard,
    href: "/",
    cta: { label: "새로 올리기", href: "/?upload=1", color: "var(--accent)" },
  },
  {
    key: "mybox",
    label: "My box",
    icon: Package,
    href: "/my/box",
    tint: "#0ea5e9",
    cta: { label: "My box에 올리기", href: "/my/box?upload=1", color: "#0ea5e9" },
  },
  {
    key: "team",
    label: "비모",
    icon: Users,
    href: "/team",
    tint: "#e85008",
    cta: { label: "비모에 올리기", href: "/team?upload=1", color: "#e85008" },
  },
  { key: "activity", label: "활동", icon: Activity, href: "/inbox", dot: true },
];

export function SegmentSidebar({
  isAdmin,
  isPartner = false,
  initials,
  name,
  subtitle,
}: {
  isAdmin: boolean;
  isPartner?: boolean;
  initials: string;
  name: string;
  subtitle: string;
}) {
  const pathname = usePathname();
  const active = railFromPath(pathname);
  const activeSpace = SPACES.find((s) => s.key === active);
  const cta = activeSpace?.cta;
  // 활성 공간 색을 활성 요소(메뉴 아이템·세그먼트)에만 절제해서 전파 (v3 풀-틴트 축약).
  // 전체 배경은 물들이지 않음 — 공간 전환 시 산만함 방지(심사 한줄평 반영).
  const spaceAccent = activeSpace?.tint ?? "var(--accent)";

  return (
    <div
      className="w-[232px] bg-white border-r border-border flex flex-col h-screen"
      style={{ ["--space-accent" as string]: spaceAccent }}
    >
      {/* 로고 */}
      <Link
        href="/"
        title={`Vibox ${APP_VERSION} · ${APP_LAST_UPDATED}`}
        className="px-4 pt-5 pb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Image
          src="/logo.png"
          alt="Vibox"
          width={28}
          height={28}
          priority
          className="rounded"
        />
        <span className="text-xl font-bold tracking-tight text-text">
          vi<span className="text-accent">.box</span>
        </span>
      </Link>

      {/* 검색 */}
      <MenuSearch />

      {/* 세그먼트 컨트롤 — 공간 전환 (Rail 대체) */}
      <div className="mx-3 mt-1 mb-2 flex items-stretch gap-0.5 p-1 rounded-xl bg-surface">
        {SPACES.map((s) => {
          const isActive = active === s.key;
          const Icon = s.icon;
          const tint = s.tint ?? "var(--accent)";
          return (
            <Link
              key={s.key}
              href={s.href}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors ${
                isActive
                  ? "shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-text-soft hover:text-text"
              }`}
              style={
                isActive
                  ? {
                      color: tint,
                      background: `color-mix(in srgb, ${tint} 10%, white)`,
                    }
                  : undefined
              }
            >
              <span className="relative">
                <Icon size={17} strokeWidth={2} />
                {s.dot && (
                  <span
                    className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  />
                )}
              </span>
              <span className="text-2xs font-medium tracking-tight leading-none">
                {s.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* 업로드 CTA — 주황 primary로 통일. 단 홈 대시보드(/)에선 본문 적응형 히어로가
          주황 primary라 CTA는 흰색으로 양보(화면당 주황 업로드 1개 원칙). */}
      {cta && (
        <Link
          href={cta.href}
          className={`mx-3 mb-2 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-base font-semibold transition-colors ${
            pathname === "/"
              ? "bg-white border border-border text-text hover:border-border-hover hover:bg-surface"
              : "bg-accent text-white hover:bg-accent-hover"
          }`}
        >
          <Upload size={14} strokeWidth={2.4} />
          {cta.label}
        </Link>
      )}

      {/* 활성 공간 섹션 목록 */}
      <div className="flex-1 overflow-y-auto pb-2">
        <MenuRouter isAdmin={isAdmin} isPartner={isPartner} />
      </div>

      {/* 하단: 유저 · 관리(admin) · 로그아웃 */}
      <div className="mt-auto border-t border-[#f0ece9] px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-[#C8430A] text-white grid place-items-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-text truncate">
            {name}
          </div>
          <div className="text-xs text-text-faint truncate">{subtitle}</div>
        </div>
        {isAdmin && (
          <Link
            href="/admin/users"
            title="관리"
            className="p-1.5 rounded-md hover:bg-hover transition-colors"
            style={{
              color: active === "admin" ? "var(--accent)" : "var(--text-faint)",
            }}
          >
            <Settings size={16} strokeWidth={2} />
          </Link>
        )}
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
