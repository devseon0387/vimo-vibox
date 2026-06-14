"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, HardDrive, Share2, LogOut, type LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/login/actions";

/**
 * 파트너 전용 사이드바 — 그룹 라벨(클라우드 / 라이브러리) + 저장공간(프로필 아래).
 * 로고 · 프로필 · 저장공간 · 홈 · [클라우드: 비모와의 작업 · My box] · [라이브러리: 공유].
 * 톤은 비박스 중성(흰 배경·#ececec 경계), 주황은 가는 액센트로만. My box도 주황 계열.
 */

const MYBOX = "#f97316";

function activeKey(pathname: string): "home" | "team" | "mybox" | "shares" {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/my")) return "mybox";
  if (pathname.startsWith("/shares")) return "shares";
  return "home";
}

export function PartnerSidebar({
  userName,
  initials,
  usedBytes,
  quotaBytes,
}: {
  userName: string;
  initials: string;
  usedBytes: number;
  quotaBytes: number;
}) {
  const pathname = usePathname();
  const active = activeKey(pathname);
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  const item = (
    key: "home" | "team" | "mybox" | "shares",
    href: string,
    label: string,
    opts: { icon?: LucideIcon; mark?: boolean; tint?: string }
  ) => {
    const on = active === key;
    const Icon = opts.icon;
    const tint = opts.tint ?? "var(--accent)";
    return (
      <Link
        href={href}
        className="flex items-center gap-3 px-2.5 py-2 rounded-[10px] text-[13px] font-medium transition-colors"
        style={
          on
            ? { background: "var(--surface-2)", color: "var(--text)", fontWeight: 600 }
            : { color: "var(--text-soft)" }
        }
      >
        {opts.mark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/vimo-mark.svg"
            alt=""
            style={{ width: 17, height: "auto", filter: on ? "none" : "saturate(0.25) opacity(0.7)" }}
          />
        ) : Icon ? (
          <Icon size={17} strokeWidth={2} style={{ color: on ? tint : "#9a9a9a" }} />
        ) : null}
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="w-[222px] bg-white border-r border-border flex flex-col h-screen">
      {/* 로고 */}
      <Link
        href="/"
        className="px-4 pt-4 pb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Image src="/logo.png" alt="Vibox" width={26} height={26} priority className="rounded" />
        <span className="text-[15px] font-bold tracking-tight text-text">비박스</span>
      </Link>

      {/* 프로필 */}
      <div className="px-3 flex items-center gap-2.5">
        <span className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-accent to-[#C8430A] text-white grid place-items-center text-[12px] font-bold shrink-0">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-text truncate">{userName || "파트너"}</div>
          <div className="text-[10.5px] text-text-faint truncate">외부 편집 · 파트너</div>
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

      {/* 저장공간 — 프로필 바로 아래 */}
      <div className="px-3 pt-3 pb-3">
        <div className="flex items-center justify-between text-[10.5px] text-text-faint mb-1.5">
          <span className="font-semibold text-text-muted">저장 공간</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-[#ececec]">
          <div className="h-full rounded-full" style={{ background: MYBOX, width: `${pct}%` }} />
        </div>
      </div>

      <div className="mx-3 h-px bg-border" />

      {/* 내비게이션 — 그룹 라벨 */}
      <nav className="px-3 pt-2 flex-1 overflow-y-auto">
        {item("home", "/", "홈", { icon: House })}

        <div className="text-[10.5px] font-bold text-text-faint tracking-wide px-2.5 pt-3.5 pb-1.5">
          클라우드
        </div>
        {item("team", "/team?path=/Rendering", "비모와의 작업", { mark: true, tint: "#e85008" })}
        {item("mybox", "/my/box", "My box", { icon: HardDrive, tint: MYBOX })}

        <div className="text-[10.5px] font-bold text-text-faint tracking-wide px-2.5 pt-3.5 pb-1.5">
          라이브러리
        </div>
        {item("shares", "/shares", "공유", { icon: Share2 })}
      </nav>
    </div>
  );
}
