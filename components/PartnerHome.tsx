"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  Search,
  Upload,
  HardDrive,
  Film,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Music,
  Play,
  History,
  MessageSquare,
  Share2,
  Download,
  Star,
  Check,
  ChevronUp,
  ChevronDown,
  Ellipsis,
  List as ListIcon,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import type { MyRecentFile, PersonalSummary } from "@/lib/dashboard/queries";
import { formatBytes, formatRelative, teamFileStatus } from "./home-ui";
import { ThumbImg } from "./ThumbImg";

/**
 * 파트너 홈 — 디자인(home-prototype.html)대로:
 *  가장 최근 영상 히어로 + 즐겨찾기 카드 행 + 드라이브 리스트(날짜 그룹·2줄 행·리스트/그리드).
 *  즐겨찾기는 localStorage로 실제 동작. 썸네일은 /api/thumb(없으면 아이콘 폴백).
 *  비모=주황 / My box·중성. 크기·길이는 데이터 미제공으로 생략.
 */

const FAV_KEY = "vibox:favs";
/** 사이드바가 읽는 즐겨찾기 표시 메타: { [path]: { filename, space } }.
 *  FAV_KEY(path 배열)는 그대로 두고, 이름·공간 표시용으로만 별도 동기화한다. */
const FAVMETA_KEY = "vibox:favmeta";
type FavMeta = Record<string, { filename: string; space: "team" | "personal" }>;

type SortKey = "name" | "when" | "size";

/** 파일/폴더 개수 (현재 데이터엔 폴더 없음 → 폴더 0). */
function countOf(files: MyRecentFile[]): { f: number; d: number } {
  return { f: files.length, d: 0 };
}

type Kind = "video" | "image" | "audio" | "doc" | "file";
function kindOf(name: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "m4v", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) return "audio";
  if (["pdf", "key", "ppt", "pptx", "doc", "docx", "txt", "md", "srt", "vtt"].includes(ext)) return "doc";
  return "file";
}
const KICON: Record<Kind, LucideIcon> = {
  video: Film,
  image: ImageIcon,
  audio: Music,
  doc: FileText,
  file: FileIcon,
};
const KLABEL: Record<Kind, string> = {
  video: "영상",
  image: "이미지",
  audio: "오디오",
  doc: "문서",
  file: "파일",
};
function glyph(name: string): LucideIcon {
  return KICON[kindOf(name)];
}
function kindLabel(name: string): string {
  return KLABEL[kindOf(name)];
}
function verOf(name: string): string | null {
  const m = name.match(/v(\d+)/i);
  return m ? `v${m[1]}` : null;
}
function Hero({ f }: { f: MyRecentFile }) {
  const isTeam = f.space === "team";
  const ver = verOf(f.filename);
  const s = isTeam ? teamFileStatus(f) : null;
  const SIcon = s?.Icon;
  const fileHref = isTeam ? "/team?path=/Rendering" : "/my/box";
  const uploadHref = isTeam ? "/team?upload=1" : "/my/box?upload=1";
  return (
    <section className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: isTeam ? "#fbd9c4" : "var(--border)" }}>
      <div className="flex flex-col sm:flex-row">
        <Link
          href={fileHref}
          className="relative sm:w-[300px] aspect-video flex-none grid place-items-center overflow-hidden group"
          style={{ background: isTeam ? "linear-gradient(135deg,#7c3a1d,#c2683a)" : "linear-gradient(135deg,#3f3f46,#71717a)" }}
        >
          {kindOf(f.filename) === "video" && (
            <ThumbImg path={f.path} className="absolute inset-0 w-full h-full object-cover" fallback={<span />} />
          )}
          <span className="relative w-12 h-12 rounded-full bg-white/90 grid place-items-center shadow-lg transition-transform group-hover:scale-105">
            <Play size={20} strokeWidth={1} className="text-neutral-900 ml-0.5" fill="currentColor" />
          </span>
          {ver && (
            <span className="absolute left-2.5 bottom-2.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md" style={{ background: "var(--accent-soft)", color: "#c8430a" }}>{ver}</span>
          )}
        </Link>
        <div className="flex-1 min-w-0 p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold mb-2">
            <History size={15} strokeWidth={2.2} style={{ color: "var(--accent)" }} /> 가장 최근 영상
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-text-faint mb-1.5">
            {isTeam ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/vimo-mark.svg" alt="" style={{ width: 13, height: "auto" }} />
                <b className="text-text-soft font-semibold">비모와의 작업</b>
              </>
            ) : (
              <>
                <HardDrive size={13} strokeWidth={2.2} style={{ color: "#52525b" }} />
                <b className="text-text-soft font-semibold">My box</b>
              </>
            )}
            <span>· {formatRelative(f.uploadedAt)} 업로드</span>
          </div>
          <h2 className="text-[17px] font-extrabold tracking-tight flex items-center gap-2 min-w-0">
            <span className="truncate">{f.filename}</span>
            {ver && <span className="flex-none text-[11px] font-extrabold px-1.5 py-0.5 rounded-md" style={{ background: "var(--accent-soft)", color: "var(--team-dark)", border: "1px solid #fbd9c4" }}>{ver}</span>}
          </h2>
          {isTeam && s && (
            <div className="mt-2.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>
                {SIcon && <SIcon size={12} strokeWidth={2.4} />} {s.label}
              </span>
            </div>
          )}
          <div className="mt-auto pt-4 flex items-center gap-2 flex-wrap">
            <Link href={uploadHref} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-3.5 py-2 rounded-lg" style={{ background: "var(--accent)" }}>
              <Upload size={15} strokeWidth={2.2} /> 새 버전 올리기
            </Link>
            <Link href={fileHref} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors">
              <MessageSquare size={15} strokeWidth={2.1} /> 코멘트 보기
            </Link>
            <Link href={fileHref} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors">
              <Share2 size={15} strokeWidth={2.1} /> 공유
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 즐겨찾기 카드 안의 작은 아이콘 박스 (33x33, 무채색). */
function FavIcon({ f }: { f: MyRecentFile }) {
  const G = glyph(f.filename);
  return (
    <span
      className="relative grid place-items-center w-[33px] h-[33px] rounded-lg flex-none overflow-hidden"
      style={{ background: "var(--mybox-soft)", color: "var(--mybox)" }}
    >
      {kindOf(f.filename) === "video" ? (
        <ThumbImg path={f.path} className="absolute inset-0 w-full h-full object-cover" fallback={<G size={16} strokeWidth={2} />} />
      ) : (
        <G size={16} strokeWidth={2} />
      )}
    </span>
  );
}

/** 행 썸네일 — 폴더(.rfold) / 파일 아이콘(.ricon). dev에 실영상 없어 img 대신 아이콘 박스. */
function RowThumb({ f }: { f: MyRecentFile }) {
  const G = glyph(f.filename);
  return (
    <span
      className="relative grid place-items-center w-11 h-[38px] rounded-lg flex-none overflow-hidden"
      style={{ background: "var(--mybox-soft)", color: "var(--mybox)" }}
    >
      {kindOf(f.filename) === "video" ? (
        <ThumbImg path={f.path} className="absolute inset-0 w-full h-full object-cover" fallback={<G size={18} strokeWidth={2} />} />
      ) : (
        <G size={18} strokeWidth={2} />
      )}
    </span>
  );
}

function FavCard({ f, hrefOf, onToggle }: { f: MyRecentFile; hrefOf: (f: MyRecentFile) => string; onToggle: (p: string) => void }) {
  const subRight = f.space === "team" ? "비모" : "My box";
  return (
    <Link
      href={hrefOf(f)}
      className="fcard group relative flex items-center gap-2.5 py-[11px] px-3 border rounded-xl bg-white transition-colors min-w-0"
      style={{ borderColor: "var(--line2)" }}
      role="button"
      tabIndex={0}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--dash)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "var(--line2)"; }}
    >
      <FavIcon f={f} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-bold pr-[15px]">{f.filename}</span>
        <span className="block text-[10.5px]" style={{ color: "var(--faint)" }}>
          {kindLabel(f.filename)} · {subRight}
        </span>
      </span>
      <button
        type="button"
        aria-label="즐겨찾기 해제"
        aria-pressed
        onClick={(e) => { e.preventDefault(); onToggle(f.path); }}
        className="fstar absolute top-2 right-2 w-[22px] h-[22px] rounded-md grid place-items-center"
      >
        <Star size={13} className="fill-accent text-accent" />
      </button>
    </Link>
  );
}

function DriveRow({
  f,
  href,
  fav,
  selected,
  onSelect,
  onToggleFav,
  dim,
}: {
  f: MyRecentFile;
  href: string;
  fav: boolean;
  selected: boolean;
  onSelect: (path: string, shift: boolean) => void;
  onToggleFav: (p: string) => void;
  dim?: boolean;
}) {
  const isTeam = f.space === "team";
  const s = isTeam ? teamFileStatus(f) : null;
  const exact = new Date(f.uploadedAt).toLocaleString("ko-KR");
  return (
    <Link
      href={href}
      className="dgrid drow group transition-colors"
      style={{
        borderTop: "1px solid var(--hair)",
        fontSize: "12.5px",
        background: selected ? "var(--sel)" : undefined,
        opacity: dim ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--surface)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = ""; }}
    >
      {/* 1. lead 체크박스 */}
      <span className="lead">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label="선택"
          onClick={(e) => { e.preventDefault(); onSelect(f.path, (e as React.MouseEvent).shiftKey); }}
          className={`ck w-[17px] h-[17px] rounded-[5px] grid place-items-center ${selected ? "on" : ""}`}
          style={{
            border: selected ? "1.6px solid var(--ink)" : "1.6px solid #c8c8c8",
            background: selected ? "var(--ink)" : "#fff",
          }}
        >
          <Check size={12} strokeWidth={3} className="text-white" style={{ opacity: selected ? 1 : 0 }} />
        </button>
      </span>

      {/* 2. 이름 (2줄) */}
      <span className="nm min-w-0">
        <span className="namebtn flex items-center gap-3 w-full text-left">
          <RowThumb f={f} />
          <span className="nmeta flex flex-col gap-0.5 min-w-0">
            <span className="t block truncate font-semibold group-hover:underline" style={{ fontSize: "12.5px" }}>
              {f.filename}
            </span>
            <span className="sub flex items-center gap-1 truncate text-[10.5px]" style={{ color: "var(--faint)" }}>
              <span className="truncate">{kindLabel(f.filename)}</span>
              {s && <span className="truncate">· {s.label}</span>}
              {f.hasShareLink && (
                <span className="sh font-semibold whitespace-nowrap" style={{ color: "var(--team-dark)" }}>· 공유 중</span>
              )}
            </span>
          </span>
        </span>
      </span>

      {/* 3. 수정일 */}
      <span className="c col-when whitespace-nowrap" style={{ color: "var(--faint)", fontSize: "11.5px" }} title={exact}>
        {formatRelative(f.uploadedAt)}
      </span>

      {/* 4. 크기 (per-file 데이터 없음 → —) */}
      <span className="c" style={{ color: "var(--faint)", fontSize: "11.5px" }}>—</span>

      {/* 5. trail 액션 */}
      <span className="trail flex items-center justify-end gap-px">
        <button
          type="button"
          aria-label="즐겨찾기"
          aria-pressed={fav}
          onClick={(e) => { e.preventDefault(); onToggleFav(f.path); }}
          className={`ract fav w-7 h-7 rounded-md grid place-items-center ${fav ? "on" : ""}`}
          style={{ color: fav ? "var(--accent)" : "var(--faint)" }}
        >
          <Star size={16} className={fav ? "fill-accent" : ""} />
        </button>
        <button type="button" aria-label="다운로드" onClick={(e) => e.preventDefault()}
          className="ract w-7 h-7 rounded-md grid place-items-center" style={{ color: "var(--faint)" }}>
          <Download size={16} />
        </button>
        <button type="button" aria-label="공유" onClick={(e) => e.preventDefault()}
          className="ract w-7 h-7 rounded-md grid place-items-center" style={{ color: "var(--faint)" }}>
          <Share2 size={16} />
        </button>
        <button type="button" aria-label="더보기" onClick={(e) => e.preventDefault()}
          className="ract more w-7 h-7 rounded-md grid place-items-center" style={{ color: "var(--faint)" }}>
          <Ellipsis size={16} />
        </button>
      </span>
    </Link>
  );
}

function GridCard({
  f,
  href,
  fav,
  selected,
  onSelect,
  onToggleFav,
}: {
  f: MyRecentFile;
  href: string;
  fav: boolean;
  selected: boolean;
  onSelect: (path: string, shift: boolean) => void;
  onToggleFav: (p: string) => void;
}) {
  const G = glyph(f.filename);
  return (
    <Link
      href={href}
      className="gcard group relative bg-white border overflow-hidden transition-shadow"
      style={{
        borderColor: "var(--line2)",
        borderRadius: 13,
        outline: selected ? "2px solid var(--ink)" : undefined,
        outlineOffset: selected ? -2 : undefined,
      }}
    >
      {/* 썸네일 자리 — 무채색 아이콘 플레이스홀더 */}
      <span className="gth relative grid h-[104px] place-items-center overflow-hidden" style={{ background: "var(--mybox-soft)" }}>
        {kindOf(f.filename) === "video" ? (
          <ThumbImg path={f.path} className="absolute inset-0 w-full h-full object-cover" fallback={<G size={34} strokeWidth={1.6} style={{ color: "var(--mybox)" }} />} />
        ) : (
          <G size={34} strokeWidth={1.6} style={{ color: "var(--mybox)" }} />
        )}
      </span>
      {/* 체크박스 (좌상단) */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label="선택"
        onClick={(e) => { e.preventDefault(); onSelect(f.path, (e as React.MouseEvent).shiftKey); }}
        className={`gck absolute top-[7px] left-[7px] w-[18px] h-[18px] rounded-[5px] grid place-items-center ${selected ? "on" : ""}`}
        style={{
          border: selected ? "1.6px solid var(--ink)" : "1.6px solid #c8c8c8",
          background: selected ? "var(--ink)" : "rgba(255,255,255,.92)",
        }}
      >
        <Check size={12} strokeWidth={3} className="text-white" style={{ opacity: selected ? 1 : 0 }} />
      </button>
      {/* 별 (우상단) */}
      <button
        type="button"
        aria-label="즐겨찾기"
        aria-pressed={fav}
        onClick={(e) => { e.preventDefault(); onToggleFav(f.path); }}
        className={`gstar absolute top-[5px] right-[5px] w-[22px] h-[22px] rounded-md grid place-items-center ${fav ? "on" : ""}`}
        style={{ background: "rgba(255,255,255,.92)" }}
      >
        <Star size={13} className={fav ? "fill-accent text-accent" : ""} style={{ color: fav ? undefined : "#bdbdbd" }} />
      </button>
      {/* 메타 */}
      <div className="gmeta flex items-center gap-1.5" style={{ padding: "9px 11px" }}>
        <span className="gn truncate flex-1 text-[12px] font-bold">{f.filename}</span>
        <span className="gc text-[10.5px]" style={{ color: "var(--faint)" }}>{kindLabel(f.filename)}</span>
        <button type="button" aria-label="더보기" onClick={(e) => e.preventDefault()}
          className="more-b grid place-items-center" style={{ color: "var(--faint)" }}>
          <Ellipsis size={15} />
        </button>
      </div>
    </Link>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="grp">{children}</div>
  );
}

/** 컬럼 헤더 행 (.dgrid.dhead): 전체선택 체크 + 이름/수정일/크기 정렬 버튼. 종류 컬럼 헤더는 없음. */
function ColumnHeader({
  sortKey,
  sortDir,
  onSort,
  allSel,
  onSelectAll,
}: {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  allSel: boolean;
  onSelectAll: () => void;
}) {
  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null;
  const HCol = ({ k, label, cls }: { k: SortKey; label: string; cls?: string }) => (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`inline-flex items-center gap-[3px] ${cls ?? ""}`}
      style={{ fontSize: "10.5px", fontWeight: 700, color: sortKey === k ? "var(--ink)" : "var(--faint)" }}
    >
      {label}
      {arrow(k)}
    </button>
  );
  return (
    <div
      className="dgrid dhead"
      style={{
        fontSize: "10.5px",
        fontWeight: 700,
        color: "var(--faint)",
        borderBottom: "1px solid var(--hair)",
        background: "var(--surface)",
      }}
    >
      <span className="lead">
        <button
          type="button"
          role="checkbox"
          aria-checked={allSel}
          aria-label="전체 선택"
          onClick={onSelectAll}
          className={`ck w-[17px] h-[17px] rounded-[5px] grid place-items-center ${allSel ? "on" : ""}`}
          style={{
            border: allSel ? "1.6px solid var(--ink)" : "1.6px solid #c8c8c8",
            background: allSel ? "var(--ink)" : "#fff",
          }}
        >
          <Check size={12} strokeWidth={3} className="text-white" style={{ opacity: allSel ? 1 : 0 }} />
        </button>
      </span>
      <HCol k="name" label="이름" />
      <HCol k="when" label="수정일" cls="h-when" />
      <HCol k="size" label="크기" />
      <span />
    </div>
  );
}

export function PartnerHome({
  userName,
  personalSummary,
  recentFiles,
}: {
  userName: string;
  personalSummary: PersonalSummary;
  recentFiles: MyRecentFile[];
}) {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "grid">("list");
  const [now, setNow] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNow(Date.now());
    try {
      const raw = localStorage.getItem(FAV_KEY);
      const paths = raw ? (JSON.parse(raw) as string[]) : [];
      if (raw) setFavs(new Set(paths));
      // favmeta 동기화: favs에 있는데 메타가 없으면 recentFiles로 채운다.
      let meta: FavMeta = {};
      try {
        const mraw = localStorage.getItem(FAVMETA_KEY);
        if (mraw) meta = JSON.parse(mraw) as FavMeta;
      } catch {}
      const pathSet = new Set(paths);
      const next: FavMeta = {};
      let changed = false;
      for (const p of paths) {
        if (meta[p]) { next[p] = meta[p]; continue; }
        const f = recentFiles.find((x) => x.path === p);
        if (f) { next[p] = { filename: f.filename, space: f.space }; changed = true; }
      }
      // favs에서 빠진 메타는 제거
      for (const k of Object.keys(meta)) if (!pathSet.has(k)) changed = true;
      if (changed) {
        try { localStorage.setItem(FAVMETA_KEY, JSON.stringify(next)); } catch {}
      }
    } catch {}
  }, [recentFiles]);

  const toggleFav = (p: string) =>
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...n])); } catch {}
      // favmeta도 같이 동기화 (FAV_KEY·리스트 동작은 위에서 그대로 유지).
      try {
        let meta: FavMeta = {};
        const mraw = localStorage.getItem(FAVMETA_KEY);
        if (mraw) meta = JSON.parse(mraw) as FavMeta;
        if (n.has(p)) {
          const f = recentFiles.find((x) => x.path === p);
          if (f) meta[p] = { filename: f.filename, space: f.space };
        } else {
          delete meta[p];
        }
        localStorage.setItem(FAVMETA_KEY, JSON.stringify(meta));
      } catch {}
      // 같은 탭의 사이드바 즐겨찾기 즉시 반영 (storage 이벤트는 동일 탭 미발화)
      try { window.dispatchEvent(new Event("vibox:favchange")); } catch {}
      return n;
    });

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const team = recentFiles.filter((f) => f.space === "team");
  const personal = recentFiles.filter((f) => f.space === "personal");
  const active = team.filter((f) => !f.approved);
  const heroFile = active[0] ?? personal[0] ?? recentFiles[0] ?? null;

  const favFiles = recentFiles.filter((f) => favs.has(f.path)).slice(0, 8);
  const rest = recentFiles.filter((f) => !favs.has(f.path));
  const hrefOf = (f: MyRecentFile) => (f.space === "team" ? "/team?path=/Rendering" : "/my/box");

  // 정렬 (이름/수정일만 실동작 — per-file size 데이터 없어 크기 정렬은 noop)
  const sortNodes = (nodes: MyRecentFile[]): MyRecentFile[] => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...nodes].sort((a, b) => {
      if (sortKey === "name") return a.filename.localeCompare(b.filename, "ko") * dir;
      return (a.uploadedAt - b.uploadedAt) * dir;
    });
  };
  const sortedRest = sortNodes(rest);

  // 전체 선택 토글 (현재 보이는 파일 기준)
  const allSel = sortedRest.length > 0 && sortedRest.every((f) => selected.has(f.path));
  const selectAll = () =>
    setSelected((prev) => {
      if (allSel) return new Set<string>();
      return new Set(sortedRest.map((f) => f.path));
    });
  const toggleSel = (path: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  const cnt = countOf(recentFiles);

  const pct = personalSummary.quotaBytes > 0
    ? Math.min(100, Math.round((personalSummary.usedBytes / personalSummary.quotaBytes) * 100))
    : 0;

  // 그룹: sortKey==='when'이면 날짜 그룹(오늘/이번 주/이전), 아니면 단일 '파일' 그룹.
  // 날짜 그룹은 now 확정 후에만 (hydration 안전).
  const buckets: { label: string; items: MyRecentFile[] }[] = [];
  if (sortKey === "when" && now != null) {
    const day = 86_400_000;
    const groups: Record<string, MyRecentFile[]> = { 오늘: [], "이번 주": [], 이전: [] };
    for (const f of sortedRest) {
      const d = (now - f.uploadedAt) / day;
      (d <= 1 ? groups["오늘"] : d <= 7 ? groups["이번 주"] : groups["이전"]).push(f);
    }
    for (const label of ["오늘", "이번 주", "이전"]) if (groups[label].length) buckets.push({ label, items: groups[label] });
  } else if (sortedRest.length) {
    buckets.push({ label: "파일", items: sortedRest });
  }

  return (
    <div className="min-h-full bg-surface-2">
      {/* 툴바 */}
      <div className="bg-white border-b border-border px-4 md:px-8 py-3 flex items-center gap-3">
        <h1 className="text-[15.5px] font-bold truncate">안녕하세요{userName ? `, ${userName}님` : ""}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/?focus=search" className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 text-text-faint text-[12.5px] hover:bg-hover transition-colors">
            <Search size={14} strokeWidth={2} /> 검색
          </Link>
          <Link href="/team?upload=1" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-3.5 py-2 rounded-lg" style={{ background: "var(--accent)" }}>
            <Upload size={15} strokeWidth={2.2} /> 업로드
          </Link>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 mx-auto w-full max-w-[940px] flex flex-col gap-5">
        {heroFile && <Hero f={heroFile} />}

        {/* My box 헤더 + 리스트/그리드 토글 */}
        <div>
          <div className="mbhead flex items-center flex-wrap gap-[9px] mt-[26px] mb-3.5 mx-0.5 text-[13.5px] font-extrabold">
            <HardDrive size={17} strokeWidth={2.2} style={{ color: "var(--mybox)" }} />
            My box
            <span className="sum font-medium text-[11.5px]" style={{ color: "var(--faint)" }}>
              파일 {cnt.f} · 폴더 {cnt.d}
            </span>
            <div className="right ml-auto flex items-center gap-[7px]">
              <div className="vtog inline-flex overflow-hidden" style={{ border: "1px solid var(--line2)", borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`px-2 py-[5px] flex items-center gap-1 text-[11px] font-semibold ${view === "list" ? "on" : ""}`}
                  style={view === "list" ? { background: "#ececec", color: "var(--ink)" } : { background: "#fff", color: "var(--faint)" }}
                >
                  <ListIcon size={13} /> 리스트
                </button>
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  className={`px-2 py-[5px] flex items-center gap-1 text-[11px] font-semibold ${view === "grid" ? "on" : ""}`}
                  style={view === "grid" ? { background: "#ececec", color: "var(--ink)" } : { background: "#fff", color: "var(--faint)" }}
                >
                  <LayoutGrid size={13} /> 그리드
                </button>
              </div>
              <Link
                href="/my/box?upload=1"
                className="mbup inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-white rounded-lg px-3 py-1.5"
                style={{ background: "var(--ink)" }}
              >
                <Upload size={13} strokeWidth={2.3} /> 올리기
              </Link>
            </div>
          </div>

          {/* 즐겨찾기 카드 행 — 루트에서만 */}
          {favFiles.length > 0 ? (
            <>
              <div className="sublbl flex items-center gap-1.5 mb-2.5 mx-0.5 text-[11.5px] font-bold" style={{ color: "var(--text-soft)" }}>
                <Star size={13} className="fill-accent text-accent" /> 즐겨찾기
              </div>
              <div className="fcards grid grid-cols-2 sm:grid-cols-4 gap-[11px] mb-[22px]">
                {favFiles.map((f) => <FavCard key={f.path} f={f} hrefOf={hrefOf} onToggle={toggleFav} />)}
              </div>
            </>
          ) : (
            <div className="sublbl flex items-center gap-1.5 mb-2.5 mx-0.5 text-[11.5px] font-bold" style={{ color: "var(--text-soft)" }}>
              <Star size={13} className="fill-accent text-accent" /> 즐겨찾기
              <span className="hint font-medium" style={{ color: "var(--faint)" }}>— 아래 파일의 별을 눌러 자주 쓰는 항목을 고정하세요</span>
            </div>
          )}

          {/* 전체 파일 — 리스트/그리드 */}
          {rest.length === 0 ? (
            <section className="dlist bg-white overflow-hidden" style={{ border: "1px solid var(--line2)", borderRadius: 12 }}>
              <p className="text-[12.5px] py-8 text-center" style={{ color: "var(--faint)" }}>보관함이 비어 있어요</p>
            </section>
          ) : view === "list" ? (
            <section className="dlist bg-white overflow-hidden" style={{ border: "1px solid var(--line2)", borderRadius: 12 }}>
              <ColumnHeader sortKey={sortKey} sortDir={sortDir} onSort={setSort} allSel={allSel} onSelectAll={selectAll} />
              {buckets.map((b) => (
                <Fragment key={b.label}>
                  <GroupLabel>{b.label}</GroupLabel>
                  {b.items.map((f) => (
                    <DriveRow
                      key={f.path}
                      f={f}
                      href={hrefOf(f)}
                      fav={favs.has(f.path)}
                      selected={selected.has(f.path)}
                      onSelect={toggleSel}
                      onToggleFav={toggleFav}
                      dim={f.space === "team" && f.approved}
                    />
                  ))}
                </Fragment>
              ))}
            </section>
          ) : (
            <div className="mbgrid grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))" }}>
              {sortedRest.map((f) => (
                <GridCard
                  key={f.path}
                  f={f}
                  href={hrefOf(f)}
                  fav={favs.has(f.path)}
                  selected={selected.has(f.path)}
                  onSelect={toggleSel}
                  onToggleFav={toggleFav}
                />
              ))}
            </div>
          )}

          {/* 저장 공간 */}
          <div className="pt-2.5 pb-1 mt-3" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="flex items-center justify-between text-[10.5px] mb-1" style={{ color: "var(--faint)" }}>
              <span>저장 공간</span>
              <span className="tabular-nums">{formatBytes(personalSummary.usedBytes)} / {formatBytes(personalSummary.quotaBytes)}</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-surface-2">
              <div className="h-full rounded-full" style={{ background: "var(--accent)", width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
