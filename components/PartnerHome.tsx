"use client";

import Link from "next/link";
import {
  Search,
  Upload,
  HardDrive,
  CheckCircle2,
  Moon,
  ChevronRight,
  Film,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import type { MyRecentFile, PersonalSummary } from "@/lib/dashboard/queries";
import { formatBytes, formatRelative, teamFileStatus } from "./home-ui";

/**
 * 파트너(외부 편집자) 홈 — "드라이브" 카드 섹션 + 비모 일 적응.
 *  - 비모와의 작업(=비모에 납품): 옅은 워시 헤더로 강조, 진행 중인 작업이 맨 위.
 *  - My box(=내 보관함): 주황 톤, 개인 파일.
 *  - 지난 비모 작업(승인): 항상 조회 가능, 흐리게.
 * 비모 일이 없으면 My box가 맨 위로 올라오고, 비모 영역은 "진행 중 없음"으로 차분히 둔다.
 * 톤은 비박스 앱 중성(#f7f7f7 surface-2 위 흰 카드), 주황은 가는 액센트로만.
 */

const MYBOX = "#f97316";

function glyph(name: string): LucideIcon {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "m4v", "avi", "mkv", "webm"].includes(ext)) return Film;
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return ImageIcon;
  if (["pdf", "key", "ppt", "pptx", "doc", "docx", "txt", "md"].includes(ext)) return FileText;
  return FileIcon;
}

function FileRow({
  f,
  href,
  accent,
  dim,
}: {
  f: MyRecentFile;
  href: string;
  accent: string;
  dim?: boolean;
}) {
  const G = glyph(f.filename);
  const isTeam = f.space === "team";
  const s = teamFileStatus(f);
  const SIcon = s.Icon;
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors"
      style={dim ? { opacity: 0.62 } : undefined}
    >
      <span
        className="grid place-items-center w-9 h-7 rounded-md flex-none"
        style={{ background: "var(--surface-2)", color: accent }}
      >
        <G size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{f.filename}</span>
      {isTeam && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold flex-none"
          style={{ background: s.bg, color: s.color }}
        >
          <SIcon size={11} strokeWidth={2.4} /> {s.label}
        </span>
      )}
      <span className="text-[11px] text-text-faint flex-none tabular-nums w-[52px] text-right">
        {formatRelative(f.uploadedAt)}
      </span>
    </Link>
  );
}

function Card({
  children,
  vimo,
}: {
  children: React.ReactNode;
  vimo?: boolean;
}) {
  return (
    <section
      className="bg-white border rounded-2xl overflow-hidden"
      style={{ borderColor: vimo ? "#fbd9c4" : "var(--border)" }}
    >
      {children}
    </section>
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
  const team = recentFiles.filter((f) => f.space === "team");
  const personal = recentFiles.filter((f) => f.space === "personal");
  const active = team.filter((f) => !f.approved);
  const approved = team.filter((f) => f.approved);
  const hasWork = active.length > 0;
  const needsAction = active.filter((f) => f.needsNewVersion).length;

  // ── 카드 빌더 ──────────────────────────────────────────────
  const vimoActiveCard = (
    <Card vimo key="vimo-active">
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 border-b"
        style={{ background: "var(--accent-soft)", borderColor: "#fbd9c4" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vimo-mark.svg" alt="" style={{ width: 18, height: "auto" }} />
        <span className="text-[13px] font-extrabold" style={{ color: "var(--team-dark)" }}>
          비모와의 작업
        </span>
        <span className="text-[11px] font-medium text-text-faint">
          진행 중 {active.length}
          {needsAction > 0 ? ` · 수정 요청 ${needsAction}` : ""}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold rounded-full px-2.5 py-1 bg-white"
          style={{ border: "1px solid #fbd9c4", color: "var(--team-dark)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--team-color)" }} />
          지금 작업 중
        </span>
      </div>
      <div className="p-2">
        {active.map((f) => (
          <FileRow key={f.path} f={f} accent="var(--team-color)" href="/team?path=/Rendering" />
        ))}
      </div>
    </Card>
  );

  const pct =
    personalSummary.quotaBytes > 0
      ? Math.min(100, Math.round((personalSummary.usedBytes / personalSummary.quotaBytes) * 100))
      : 0;

  const myBoxCard = (first?: boolean) => (
    <Card key="mybox">
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
        <HardDrive size={15} strokeWidth={2.2} style={{ color: MYBOX }} />
        <span className="text-[13px] font-extrabold">My box</span>
        <span className="text-[11px] font-medium text-text-faint">· 내 보관함 {personal.length}</span>
        {first && (
          <span
            className="ml-auto text-[10px] font-bold text-white rounded-full px-2.5 py-0.5"
            style={{ background: MYBOX }}
          >
            먼저 보임
          </span>
        )}
        <Link
          href="/my/box?upload=1"
          className={`${first ? "" : "ml-auto"} inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-surface-2 transition-colors`}
          style={{ color: MYBOX }}
        >
          <Upload size={12} strokeWidth={2.3} /> 업로드
        </Link>
      </div>
      <div className="p-2">
        {personal.length === 0 ? (
          <p className="text-[12.5px] text-text-faint py-6 text-center">보관함이 비어 있습니다</p>
        ) : (
          personal.map((f) => <FileRow key={f.path} f={f} accent={MYBOX} href="/my/box" />)
        )}
      </div>
      <div className="px-3.5 pb-3 -mt-0.5">
        <div className="flex items-center justify-between text-[10.5px] text-text-faint mb-1">
          <span>저장 공간</span>
          <span className="tabular-nums">
            {formatBytes(personalSummary.usedBytes)} / {formatBytes(personalSummary.quotaBytes)}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#fff3ea" }}>
          <div className="h-full rounded-full" style={{ background: MYBOX, width: `${pct}%` }} />
        </div>
      </div>
    </Card>
  );

  const pastCard = (
    <Card key="past">
      <div className="flex items-center gap-2.5 px-3.5 py-3 text-text-faint">
        <CheckCircle2 size={15} strokeWidth={2.2} />
        <span className="text-[13px] font-extrabold">지난 비모 작업 · 승인</span>
        <span className="text-[11px] font-medium">· {approved.length}</span>
        <ChevronRight size={15} strokeWidth={2.2} className="ml-auto" />
      </div>
      {approved.length > 0 && (
        <div className="px-2 pb-2 -mt-1">
          {approved.slice(0, 3).map((f) => (
            <FileRow key={f.path} f={f} accent="var(--team-color)" href="/team?path=/Rendering" dim />
          ))}
        </div>
      )}
    </Card>
  );

  const vimoEmptyCard = (
    <Card key="vimo-empty">
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border text-text-faint">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vimo-mark.svg" alt="" style={{ width: 17, height: "auto", filter: "saturate(0.15) opacity(0.7)" }} />
        <span className="text-[13px] font-extrabold">비모와의 작업</span>
        <span className="text-[11px] font-medium">· 진행 중 없음 · 지난 승인 {approved.length}</span>
      </div>
      <div className="p-2">
        <div className="flex items-center gap-2 px-2.5 py-2.5 text-[12.5px] text-text-faint">
          <Moon size={15} strokeWidth={2} />
          진행 중인 비모 작업이 없어요. 비모가 작업을 열면 위에 카드로 강조됩니다.
        </div>
        {approved.slice(0, 3).map((f) => (
          <FileRow key={f.path} f={f} accent="var(--team-color)" href="/team?path=/Rendering" dim />
        ))}
      </div>
    </Card>
  );

  return (
    <div className="min-h-full bg-surface-2">
      {/* 툴바 */}
      <div className="bg-white border-b border-border px-4 md:px-8 py-3 flex items-center gap-3">
        <h1 className="text-[15.5px] font-bold truncate">
          안녕하세요{userName ? `, ${userName}님` : ""}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/?focus=search"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 text-text-faint text-[12.5px] hover:bg-hover transition-colors"
          >
            <Search size={14} strokeWidth={2} /> 검색
          </Link>
          <Link
            href="/team?upload=1"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-3.5 py-2 rounded-lg transition-colors"
            style={{ background: "var(--accent)" }}
          >
            <Upload size={15} strokeWidth={2.2} /> 업로드
          </Link>
        </div>
      </div>

      {/* 카드 — 비모 일 유무에 따라 순서 변경 */}
      <div className="px-4 md:px-8 py-5 mx-auto w-full max-w-[940px] flex flex-col gap-3.5">
        {hasWork ? (
          <>
            {vimoActiveCard}
            {myBoxCard(false)}
            {pastCard}
          </>
        ) : (
          <>
            {myBoxCard(true)}
            {vimoEmptyCard}
          </>
        )}
      </div>
    </div>
  );
}
