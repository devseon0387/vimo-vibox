"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Link as LinkIcon,
  ChevronDown,
  LogOut,
  ArrowLeft,
  Package,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";

/**
 * 파트너(외부 편집자) 전용 셸 — 사이드바 없는 "미니멀 상단바"(A안).
 *
 * 매니저 셸(Rail 84px + 컨텍스트 메뉴 240px)과 달리, 파트너 surface는 작아서
 * (두 공간 + 공유) 좌측 사이드바를 두면 본문 두 공간 탭과 중복된다. 그래서 셸을 역할로 분기해
 * 파트너에겐 상단바만 둔다. 공간 전환은 홈 본문의 두 큰 탭(PartnerHome)이 담당한다.
 *
 * 상단바가 담는 것:
 *  - 로고(→홈) · "파트너 워크스페이스" 라벨 · (비-홈 경로일 때) "← 홈" 폴백
 *  - 내 공유 링크(빠른 접근) · 계정 드롭다운(보조 내비 + 로그아웃)
 *
 * 사이드바를 없애면 /my/box·/team 풀 브라우저로 갈 링크가 사라지므로,
 * 계정 드롭다운에 보조 내비(내 보관함·비모·공유)를 넣어 도달성을 보존한다.
 */
export function PartnerShell({
  userName,
  initials,
  children,
}: {
  userName: string;
  initials: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const onShares = pathname.startsWith("/shares");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 경로가 바뀌면 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 바깥 클릭·Esc 로 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ===== 상단바 (유일한 네비) ===== */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-[1100px] w-full px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-3">
          {/* 좌: 로고 + 워크스페이스 (+ 비-홈일 때 홈 폴백) */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              title="비박스 홈"
              className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
            >
              <Image src="/logo.png" alt="Vibox" width={30} height={30} priority className="rounded" />
              <span className="text-lg font-semibold tracking-tight">비박스</span>
            </Link>
            <span className="h-4 w-px bg-border hidden sm:block" aria-hidden />
            <span className="text-base text-text-muted hidden sm:block">파트너 워크스페이스</span>
            {!isHome && (
              <Link
                href="/"
                className="ml-1 inline-flex items-center gap-1 text-sm font-medium text-text-faint hover:text-text transition-colors"
              >
                <ArrowLeft size={13} strokeWidth={2.2} /> 홈
              </Link>
            )}
          </div>

          {/* 우: 내 공유 링크(데스크톱 빠른링크) + 계정 드롭다운.
              모바일에선 공유를 드롭다운에 일임해 바를 비운다(로고+아바타만). */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/shares"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md hover:bg-surface transition-colors"
              style={{ color: onShares ? "var(--accent)" : "var(--text-muted)" }}
            >
              <LinkIcon size={14} strokeWidth={2} />
              내 공유 링크
            </Link>
            <span className="h-5 w-px bg-border hidden sm:block" aria-hidden />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="계정 메뉴"
              >
                <div className="text-right leading-tight hidden md:block">
                  <div className="text-base font-medium">{userName || "파트너"}</div>
                  <div className="text-xs text-text-faint">외부 편집자 · 파트너</div>
                </div>
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-[#C8430A] text-white grid place-items-center text-sm font-bold">
                  {initials}
                </span>
                <ChevronDown size={14} strokeWidth={2} className="text-text-faint hidden md:block" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 bg-white border border-border rounded-xl shadow-lg py-1.5 z-40"
                >
                  {/* 모바일에선 헤더에 이름이 안 보이므로 메뉴 상단에 표시 */}
                  <div className="px-3 py-2 border-b border-border md:hidden">
                    <div className="text-base font-medium">{userName || "파트너"}</div>
                    <div className="text-xs text-text-faint">외부 편집자 · 파트너</div>
                  </div>

                  {/* 보조 내비 — 사이드바 제거로 사라진 풀 브라우저 도달성 보존 */}
                  <Link
                    href="/my/box"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-3 py-2 text-base hover:bg-surface transition-colors"
                  >
                    <Package size={15} strokeWidth={2} style={{ color: "var(--personal)" }} /> 내 보관함
                  </Link>
                  <Link
                    href="/team"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-3 py-2 text-base hover:bg-surface transition-colors"
                  >
                    <Users size={15} strokeWidth={2} style={{ color: "var(--team-color)" }} /> 비모에 납품
                  </Link>
                  <Link
                    href="/shares"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-3 py-2 text-base hover:bg-surface transition-colors"
                  >
                    <LinkIcon size={15} strokeWidth={2} className="text-text-soft" /> 내 공유 링크
                  </Link>

                  <div className="my-1 border-t border-border" aria-hidden />
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-base text-danger hover:bg-danger-soft transition-colors"
                    >
                      <LogOut size={15} strokeWidth={2} /> 로그아웃
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ===== 본문 ===== */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
