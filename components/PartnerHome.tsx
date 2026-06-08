"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Lock,
  Upload,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { MyRecentFile, PersonalSummary } from "@/lib/dashboard/queries";

/**
 * 파트너(외부 편집자) 전용 홈.
 * 두 공간을 "탭"으로 전환 — 라벨이 곧 공개 범위 안내라 헷갈리지 않음.
 *  - 비모에 납품한 작업물 (비모팀이 봄, orange) + 상태 배지
 *  - 내 보관함 My box (나만 봄, sky) + 용량
 * 검수 큐·받은편지함·팀 통계 등 매니저 기능은 노출하지 않는다.
 * 사이드바(PartnerSidebar)가 1차 공간 전환을 맡고, 이 두 탭은 본문 내 비모/보관함 빠른 전환이다
 * (사이드바와 일부 중복 — 추후 정리 예정). 각 탭 하단 "모두 보기"로 풀 브라우저로 내려간다.
 *
 * 레이아웃: 콘텐츠가 적은 파트너 화면이라 720px 집중형 가운데 컬럼으로 둔다.
 * 업로드는 슬림 바(상태 확인이 1순위, 올리기는 명확하되 화면을 지배하지 않게).
 */

function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(b) / 3));
  return `${(b / Math.pow(1000, i)).toFixed(i <= 1 ? 0 : 1)} ${u[i]}`;
}

function formatRelative(ms: number | null): string {
  if (!ms) return "아직 없음";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function teamFileStatus(f: MyRecentFile) {
  if (f.approved) return { label: "승인됨", bg: "#f0fdf4", color: "#16a34a", Icon: CheckCircle2, cls: "pa-pop" };
  if (f.needsNewVersion) {
    return { label: `수정 요청${f.commentCount ? ` ${f.commentCount}` : ""}`, bg: "#fff7ed", color: "#c2410c", Icon: AlertCircle, cls: "pa-revise" };
  }
  return { label: "검수 중", bg: "#e0f2fe", color: "#0369a1", Icon: Clock, cls: "" };
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
  const [tab, setTab] = useState<"team" | "personal">("team");
  const teamRef = useRef<HTMLButtonElement>(null);
  const personalRef = useRef<HTMLButtonElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = tab === "team" ? teamRef.current : personalRef.current;
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  const teamFiles = recentFiles.filter((f) => f.space === "team");
  const personalFiles = recentFiles.filter((f) => f.space === "personal");
  const needsAction = teamFiles.filter((f) => f.needsNewVersion).length;

  const pct =
    personalSummary.quotaBytes > 0
      ? Math.min(100, Math.round((personalSummary.usedBytes / personalSummary.quotaBytes) * 100))
      : 0;

  return (
    <div className="px-4 md:px-8 py-6 md:py-9 mx-auto w-full max-w-[720px]">
      {/* 인사 */}
      <div className="mb-6">
        <h1 className="text-[22px] md:text-[24px] font-bold">
          안녕하세요{userName ? `, ${userName}님` : ""}
        </h1>
        {needsAction > 0 ? (
          <p
            className="pa-banner text-[12.5px] mt-1 font-medium inline-flex items-center gap-1.5"
            style={{ color: "var(--team-dark)" }}
          >
            <AlertCircle size={13} strokeWidth={2.4} className="pa-bell" />
            수정 요청 {needsAction}건이 있어요 — 확인 후 다시 올려주세요
          </p>
        ) : (
          <p className="text-[12.5px] text-text-faint mt-1">
            작업물을 올리고, 받은 피드백을 확인하세요
          </p>
        )}
      </div>

      {/* 탭 — 라벨(무엇) 위, 공개 범위(누가 보나) 아래 2줄 스택.
          좁은 화면에서도 줄바꿈으로 깨지지 않고, 공개 범위가 항상 함께 보인다. */}
      <div className="relative flex border-b border-border mb-5">
        <button
          ref={teamRef}
          onClick={() => setTab("team")}
          className="relative flex flex-col items-start pb-2.5 mr-7 transition-colors"
          style={{ color: tab === "team" ? "var(--team-color)" : "#999999" }}
        >
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/vimo-mark.svg"
              alt=""
              style={{
                width: 16,
                height: "auto",
                filter: tab === "team" ? "none" : "saturate(0) opacity(0.5)",
                transition: "filter var(--pa-dur) var(--pa-ease)",
              }}
            />
            비모에 납품한 작업물
          </span>
          <span className="text-[10.5px] font-normal mt-0.5 ml-[21px]" style={{ color: tab === "team" ? "var(--team-dark)" : "#bbbbbb" }}>
            비모팀이 봅니다
          </span>
        </button>
        <button
          ref={personalRef}
          onClick={() => setTab("personal")}
          className="relative flex flex-col items-start pb-2.5 transition-colors"
          style={{ color: tab === "personal" ? "var(--personal)" : "#999999" }}
        >
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Lock size={14} strokeWidth={2.4} />
            내 보관함
          </span>
          <span className="text-[10.5px] font-normal mt-0.5 ml-[20px]" style={{ color: tab === "personal" ? "var(--personal-dark)" : "#bbbbbb" }}>
            나만 봅니다
          </span>
        </button>
        {/* 공통 밑줄 — 활성 탭으로 슬라이드 */}
        <span
          aria-hidden
          className="absolute bottom-[-1px] h-0.5 rounded-full"
          style={{
            left: underline.left,
            width: underline.width,
            background: tab === "team" ? "var(--team-color)" : "var(--personal)",
            transition:
              "left var(--pa-dur) var(--pa-ease), width var(--pa-dur) var(--pa-ease), background var(--pa-dur)",
          }}
        />
      </div>

      {tab === "team" ? (
        <TeamTab files={teamFiles} />
      ) : (
        <PersonalTab files={personalFiles} pct={pct} summary={personalSummary} />
      )}
    </div>
  );
}

/** 슬림 업로드 바 — 한 줄, 화면을 지배하지 않되 드래그·클릭 업로드를 분명히 안내 */
function UploadBar({
  href,
  color,
  soft,
  label,
  sub,
}: {
  href: string;
  color: string;
  soft: string;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg"
      style={{ border: `1.5px dashed ${color}59`, background: soft }}
    >
      <span className="grid place-items-center w-9 h-9 rounded-lg flex-none" style={{ background: color, color: "#fff" }}>
        <Upload size={16} strokeWidth={2.3} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-tight" style={{ color }}>
          {label}
        </div>
        <div className="text-[11px] text-text-faint mt-0.5">{sub}</div>
      </div>
      <ArrowRight
        size={16}
        strokeWidth={2.2}
        className="flex-none text-text-faint transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-1 px-0.5">
      <span className="text-[11.5px] font-semibold text-text-faint tracking-wide">{label}</span>
      {count > 0 && <span className="text-[11px] text-text-faint tabular-nums">{count}개</span>}
    </div>
  );
}

/** 풀 브라우저(/my/box·/team)로 내려가는 드릴인 링크.
 *  사이드바가 없는 파트너 셸에서 홈 요약 → 폴더 브라우저 동선을 잇는다. */
function SeeAllLink({ href, color, label }: { href: string; color: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium transition-opacity hover:opacity-70"
      style={{ color }}
    >
      {label}
      <ArrowRight size={13} strokeWidth={2.2} />
    </Link>
  );
}

function TeamTab({ files }: { files: MyRecentFile[] }) {
  return (
    <div>
      <UploadBar
        href="/team?upload=1"
        color="#e85008"
        soft="#fef0e8"
        label="완성본을 비모에 납품"
        sub="올리면 비모팀이 바로 보고 검수를 시작합니다"
      />
      <SectionHeader label="납품한 작업물" count={files.length} />
      {files.length === 0 ? (
        <p className="text-[12.5px] text-text-faint py-10 text-center">아직 납품한 작업물이 없습니다</p>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f, i) => {
            const s = teamFileStatus(f);
            const StatusIcon = s.Icon;
            return (
              <li
                key={f.path}
                className="pa-row flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-surface-2 transition-colors"
                style={{ animationDelay: `calc(var(--pa-stagger) * ${i})` }}
              >
                <span className="w-1 h-7 rounded-full flex-none" style={{ background: "var(--team-color)" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{f.filename}</div>
                  <div className="text-[11px] text-text-faint">
                    {formatRelative(f.uploadedAt)}
                    {f.commentCount ? ` · 코멘트 ${f.commentCount}` : ""}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-none ${s.cls}`}
                  style={{ background: s.bg, color: s.color }}
                >
                  <StatusIcon size={11} strokeWidth={2.4} /> {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {files.length > 0 && (
        <SeeAllLink href="/team?path=/Rendering" color="var(--team-color)" label="비모 폴더에서 모두 보기" />
      )}
    </div>
  );
}

function PersonalTab({
  files,
  pct,
  summary,
}: {
  files: MyRecentFile[];
  pct: number;
  summary: PersonalSummary;
}) {
  return (
    <div>
      {/* 용량 */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[11px] text-text-faint mb-1.5">
          <span className="inline-flex items-center gap-1">
            <Lock size={11} strokeWidth={2.4} /> 나만 보는 개인 보관함
          </span>
          <span className="tabular-nums">
            {formatBytes(summary.usedBytes)} / {formatBytes(summary.quotaBytes)}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--personal-soft)" }}>
          <div className="h-full" style={{ background: "var(--personal)", width: `${pct}%` }} />
        </div>
      </div>

      <UploadBar
        href="/my/box?upload=1"
        color="#0ea5e9"
        soft="#f0f9ff"
        label="내 보관함에 저장"
        sub="나만 봅니다 · 비모팀에 전달되지 않아요"
      />

      <SectionHeader label="내 파일" count={files.length} />
      {files.length === 0 ? (
        <p className="text-[12.5px] text-text-faint py-10 text-center">보관함이 비어 있습니다</p>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f, i) => (
            <li
              key={f.path}
              className="pa-row flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-surface-2 transition-colors"
              style={{ animationDelay: `calc(var(--pa-stagger) * ${i})` }}
            >
              <span className="w-1 h-7 rounded-full flex-none" style={{ background: "var(--personal)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{f.filename}</div>
                <div className="text-[11px] text-text-faint">{formatRelative(f.uploadedAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <SeeAllLink href="/my/box" color="var(--personal)" label="내 보관함에서 모두 보기" />
      )}
    </div>
  );
}
