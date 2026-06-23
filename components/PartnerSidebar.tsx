"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  HardDrive,
  Share2,
  Trash2,
  Clock,
  Star,
  Handshake,
  Film,
  Image as ImageIcon,
  Music,
  FileText,
  File as FileIcon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { formatBytes } from "./home-ui";

/**
 * 파트너 전용 사이드바 — 디자인(home-prototype.html) 사이드바 그대로:
 *  프로필(위) · 저장공간 바(주황) · 구분선 · 홈 / 즐겨찾기 / 클라우드 / 라이브러리 · 비박스 로고(하단 푸터).
 * 톤은 비박스 중성(흰 배경·#ececec 경계), 주황(var(--accent))은 비모/저장바/즐겨찾기 별/홈 활성 아이콘에만.
 * My box는 중성. 선택/활성 = 배경 채움 + 글자색만 (좌측 띠/바 금지).
 */

const MYBOX = "var(--mybox)"; // 중성 (My box)
const VIMO = "var(--accent)"; // 주황 (비모/저장바/즐겨찾기 별)
const FAVMETA_KEY = "vibox:favmeta";

type FavMeta = Record<string, { filename: string; space: "team" | "personal" }>;
type FavEntry = { path: string; filename: string; space: "team" | "personal" };

function activeKey(pathname: string): "home" | "team" | "mybox" | "shares" | "trash" {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/my")) return "mybox";
  if (pathname.startsWith("/shares")) return "shares";
  if (pathname.startsWith("/trash")) return "trash";
  return "home";
}

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

  // 즐겨찾기 — localStorage "vibox:favmeta" 읽기 (hydration-safe: 마운트 후 채움).
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
        const list = Object.entries(meta).map(([path, m]) => ({
          path,
          filename: m.filename,
          space: m.space,
        }));
        setFavs(list);
      } catch {
        setFavs([]);
      }
    };
    load();
    // 다른 탭은 'storage', 같은 탭(홈에서 별 토글)은 커스텀 'vibox:favchange' 로 즉시 반영
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
    opts: { icon?: LucideIcon; mark?: boolean; tint?: string; star?: boolean }
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
        {opts.star ? (
          <Star size={13} strokeWidth={2} style={{ color: VIMO, fill: VIMO }} />
        ) : null}
      </Link>
    );
  };

  return (
    <div className="w-[236px] bg-surface border-r border-border flex flex-col h-screen overflow-y-auto">
      {/* 프로필 — 최상단 */}
      <div className="px-3 pt-4 flex items-center gap-2.5">
        <span className="w-[31px] h-[31px] rounded-full bg-gradient-to-br from-accent to-[#c8430a] text-white grid place-items-center text-sm font-bold shrink-0">
          {initials.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text truncate">{userName || "파트너"}</div>
          <div className="text-2xs text-text-faint truncate">외부 편집 · 파트너</div>
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
        {item(active === "home", "/", "홈", { icon: House })}

        {/* 즐겨찾기 — 홈 다음, "클라우드" 라벨 앞. 항목 없으면 섹션 자체 미표시. */}
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
        {item(active === "team", "/team?path=/Rendering", "비모와의 작업", { icon: Handshake, tint: VIMO })}
        {item(active === "mybox", "/my/box", "My box", { icon: HardDrive, tint: MYBOX })}

        <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1.5">
          라이브러리
        </div>
        {item(active === "shares", "/shares", "공유", { icon: Share2 })}
        {item(false, "/", "최근", { icon: Clock })}
        {item(active === "trash", "/trash", "휴지통", { icon: Trash2 })}
      </nav>

      {/* 비박스 로고 — 하단 푸터 (vi.box 워드마크, 검수 뷰어 헤더와 통일) */}
      <Link
        href="/"
        className="mt-auto border-t border-border px-[9px] py-[13px] flex items-center gap-2.5 sticky bottom-0 bg-surface hover:opacity-80 transition-opacity"
      >
        <span className="text-lg font-extrabold tracking-tight text-text">
          vi<span className="text-accent">.</span>box
        </span>
      </Link>
    </div>
  );
}
