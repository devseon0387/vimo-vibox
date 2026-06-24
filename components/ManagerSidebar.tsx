"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  HardDrive,
  Share2,
  Trash2,
  Inbox,
  Star,
  Handshake,
  Film,
  Image as ImageIcon,
  Music,
  FileText,
  File as FileIcon,
  LogOut,
  Users,
  Building2,
  Eye,
  BarChart3,
  ClipboardList,
  Key,
  Plug,
  Sparkles,
  Code2,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { formatBytes } from "./home-ui";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/version";

/**
 * 매니저(admin/member) 사이드바 — 파트너 새 디자인(home-prototype.html)으로 통일:
 *  프로필(위) · 저장공간 바(주황) · 구분선 · 홈 / 즐겨찾기 / 클라우드 / 라이브러리 / 관리 · vi.box 로고+버전(하단).
 *  파트너 사이드바와 동일 룩. 차이 = 비모 공간 라벨('비모 프로젝트') + 매니저 전용 '관리' 그룹(admin).
 *  (디자인 헬퍼는 PartnerSidebar와 동일 패턴 — 추후 공용화 후보.)
 */

const MYBOX = "var(--mybox)"; // 중성 (My box)
const VIMO = "var(--accent)"; // 주황 (비모/저장바/즐겨찾기 별)
const FAVMETA_KEY = "vibox:favmeta";

type FavMeta = Record<string, { filename: string; space: "team" | "personal" }>;
type FavEntry = { path: string; filename: string; space: "team" | "personal" };

/** 즐겨찾기 항목의 이동 경로 — PartnerHome.hrefOf 규칙과 동일. */
function favHref(space: "team" | "personal"): string {
  return space === "team" ? "/team?path=/Rendering" : "/my/box";
}

/** 파일명 확장자로 종류별 아이콘 (PartnerHome.kindOf와 동일 분류). */
function kindIcon(filename: string): LucideIcon {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "m4v", "avi", "mkv", "webm"].includes(ext)) return Film;
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return ImageIcon;
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) return Music;
  if (["pdf", "key", "ppt", "pptx", "doc", "docx", "txt", "md", "srt", "vtt"].includes(ext))
    return FileText;
  return FileIcon;
}

/** 관리 그룹 — 기존 AdminMenu와 동일 항목/경로 (공유 링크·휴지통 관리는 라이브러리에 있어 제외). */
const ADMIN_ITEMS: { href: string; label: string; icon: LucideIcon; prefix: string }[] = [
  { href: "/admin/users", label: "사용자", icon: Users, prefix: "/admin/users" },
  { href: "/admin/clients", label: "클라이언트", icon: Building2, prefix: "/admin/clients" },
  { href: "/admin/share-intel", label: "공유 인텔리전스", icon: Eye, prefix: "/admin/share-intel" },
  { href: "/admin/stats", label: "통계", icon: BarChart3, prefix: "/admin/stats" },
  { href: "/admin/disks", label: "디스크", icon: HardDrive, prefix: "/admin/disks" },
  { href: "/admin/storage", label: "저장소 점검", icon: HardDrive, prefix: "/admin/storage" },
  { href: "/admin/activity", label: "활동 로그", icon: ClipboardList, prefix: "/admin/activity" },
  { href: "/admin/ai-feedback", label: "AI 검수 피드백", icon: Sparkles, prefix: "/admin/ai-feedback" },
  { href: "/admin/keys", label: "API 키", icon: Key, prefix: "/admin/keys" },
  { href: "/admin/integrations", label: "SEON Hub 연동", icon: Plug, prefix: "/admin/integrations" },
  { href: "/admin/updates", label: "업데이트", icon: Sparkles, prefix: "/admin/updates" },
  { href: "/dev/notes", label: "개발 노트", icon: Code2, prefix: "/dev/notes" },
];

export function ManagerSidebar({
  userName,
  initials,
  subtitle,
  usedBytes,
  quotaBytes,
  isAdmin,
}: {
  userName: string;
  initials: string;
  subtitle: string;
  usedBytes: number;
  quotaBytes: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  // 즐겨찾기 — localStorage "vibox:favmeta" (홈에서 별 토글 → 'vibox:favchange'로 즉시 반영).
  const [favs, setFavs] = useState<FavEntry[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(FAVMETA_KEY);
        if (!raw) {
          setFavs([]);
          return;
        }
        const meta = JSON.parse(raw) as FavMeta;
        setFavs(
          Object.entries(meta).map(([path, m]) => ({ path, filename: m.filename, space: m.space })),
        );
      } catch {
        setFavs([]);
      }
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVMETA_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("vibox:favchange", load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("vibox:favchange", load);
    };
  }, []);

  const item = (
    on: boolean,
    href: string,
    label: string,
    opts: { icon?: LucideIcon; mark?: boolean; tint?: string; star?: boolean },
  ) => {
    const Icon = opts.icon;
    const tint = opts.tint ?? VIMO;
    return (
      <Link
        href={href}
        className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[9px] text-base font-medium transition-colors hover:bg-[#f0f0f0]"
        style={
          on
            ? { background: "#ececec", color: "var(--text)", fontWeight: 600 }
            : { color: "var(--text-soft)" }
        }
      >
        {opts.mark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/vimo-mark.svg"
            alt=""
            style={{ width: 16, height: "auto", filter: on ? "none" : "saturate(0.25) opacity(0.7)" }}
          />
        ) : Icon ? (
          <Icon size={16} strokeWidth={2} style={{ color: on ? tint : "#9a9a9a" }} />
        ) : null}
        <span className="truncate flex-1">{label}</span>
        {opts.star ? <Star size={13} strokeWidth={2} style={{ color: VIMO, fill: VIMO }} /> : null}
      </Link>
    );
  };

  const seg = (k: string) => pathname.startsWith(k);

  return (
    <div className="w-[236px] bg-surface border-r border-border flex flex-col h-screen overflow-y-auto">
      {/* 프로필 — 최상단 */}
      <div className="px-3 pt-4 flex items-center gap-2.5">
        <span className="w-[31px] h-[31px] rounded-full bg-gradient-to-br from-accent to-[#c8430a] text-white grid place-items-center text-sm font-bold shrink-0">
          {initials.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text truncate">{userName || "매니저"}</div>
          <div className="text-2xs text-text-faint truncate">{subtitle}</div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="로그아웃"
            aria-label="로그아웃"
            className="p-[5px] rounded-[7px] text-text-faint hover:text-text hover:bg-[#f0f0f0] transition-colors"
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
        </form>
      </div>

      {/* 저장공간 — 프로필 바로 아래 (주황 채움, 클릭 시 My box) */}
      <Link
        href="/my/box"
        className="mx-3 mt-1 px-2 py-[9px] rounded-[9px] hover:bg-[#f0f0f0] transition-colors"
      >
        <div className="flex items-center justify-between text-2xs text-text-faint mb-1.5">
          <span className="font-semibold text-text-muted">저장 공간</span>
          <span className="tabular-nums">
            {pct}% · {formatBytes(usedBytes)}
          </span>
        </div>
        <div className="w-full h-[5px] rounded-full overflow-hidden bg-[#e7e7e7]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ background: VIMO, width: `${pct}%` }}
          />
        </div>
      </Link>

      <div className="mx-1 my-2 h-px bg-border" />

      {/* 내비게이션 */}
      <nav className="px-3 flex-1">
        {item(pathname === "/", "/", "홈", { icon: House })}

        {/* 즐겨찾기 — 홈 다음. 항목 없으면 섹션 미표시. */}
        {favs.length > 0 && (
          <>
            <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1.5">
              즐겨찾기
            </div>
            {favs.slice(0, 8).map((f) => (
              <Fragment key={f.path}>
                {item(false, favHref(f.space), f.filename, {
                  icon: kindIcon(f.filename),
                  tint: f.space === "team" ? VIMO : MYBOX,
                  star: true,
                })}
              </Fragment>
            ))}
          </>
        )}

        <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1.5">
          클라우드
        </div>
        {item(seg("/team"), "/team?path=/Rendering", "비모 프로젝트", { icon: Handshake, tint: VIMO })}
        {item(seg("/my"), "/my/box", "My box", { icon: HardDrive, tint: MYBOX })}

        <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1.5">
          라이브러리
        </div>
        {item(seg("/shares"), "/shares", "공유", { icon: Share2 })}
        {item(seg("/inbox"), "/inbox", "받은편지함", { icon: Inbox })}
        {item(seg("/trash"), "/trash", "휴지통", { icon: Trash2 })}

        {/* 관리 — admin 전용 그룹 */}
        {isAdmin && (
          <>
            <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1.5">
              관리
            </div>
            {ADMIN_ITEMS.map((a) => (
              <Fragment key={a.href}>
                {item(pathname.startsWith(a.prefix), a.href, a.label, { icon: a.icon, tint: VIMO })}
              </Fragment>
            ))}
          </>
        )}
      </nav>

      {/* 비박스 로고 + 버전 — 하단 푸터 (왼쪽 vi.box, 오른쪽 버전) */}
      <div className="mt-auto border-t border-border px-[11px] py-[12px] flex items-baseline gap-2 sticky bottom-0 bg-surface">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight text-text hover:opacity-80 transition-opacity"
        >
          vi<span className="text-accent">.</span>box
        </Link>
        <span className="text-2xs font-medium text-text-faint tabular-nums">
          {APP_VERSION} · {APP_LAST_UPDATED}
        </span>
      </div>
    </div>
  );
}
