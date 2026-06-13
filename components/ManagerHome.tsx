"use client";

import { useState, useRef, useEffect } from "react";
import { Lock } from "lucide-react";
import type { MyRecentFile, PersonalSummary } from "@/lib/dashboard/queries";
import {
  formatBytes,
  formatRelative,
  teamFileStatus,
  UploadBar,
  SectionHeader,
  SeeAllLink,
} from "./home-ui";

/**
 * 매니저(admin/member) 홈.
 * PartnerHome과 같은 디자인 언어 — 두 공간을 "탭"으로 전환(비모 프로젝트 / My box),
 * 슬림 업로드 바 + 상태 배지 파일 리스트 + 드릴인. 파트너와 달리 매니저는 오버사이트가
 * 있으므로(검수 코멘트·공유 활동·받은편지함) 탭 아래에 children으로 받아 렌더한다.
 * (파트너 홈보다 콘텐츠가 많아 720 → 880px 컬럼.)
 */
export function ManagerHome({
  userName,
  personalSummary,
  recentFiles,
  newCommentsCount,
  pendingCount,
  children,
}: {
  userName: string;
  personalSummary: PersonalSummary;
  recentFiles: MyRecentFile[];
  newCommentsCount: number;
  pendingCount: number;
  children?: React.ReactNode;
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

  const pct =
    personalSummary.quotaBytes > 0
      ? Math.min(100, Math.round((personalSummary.usedBytes / personalSummary.quotaBytes) * 100))
      : 0;

  const statusParts: string[] = [];
  if (newCommentsCount > 0) statusParts.push(`새 코멘트 ${newCommentsCount}건`);
  if (pendingCount > 0) statusParts.push(`검수 대기 ${pendingCount}건`);

  return (
    <div className="px-4 md:px-8 py-6 md:py-9 mx-auto w-full max-w-[880px]">
      {/* 인사 */}
      <div className="mb-6">
        <h1 className="text-[22px] md:text-[24px] font-bold">
          안녕하세요{userName ? `, ${userName}님` : ""}
        </h1>
        <p className="text-[12.5px] text-text-faint mt-1">
          {statusParts.length > 0 ? statusParts.join(" · ") : "오늘도 좋은 작업 되세요"}
        </p>
      </div>

      {/* 두 공간 탭 — 비모 프로젝트 / My box (라벨 위, 공개 범위 아래 2줄 스택) */}
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
            비모 프로젝트
          </span>
          <span
            className="text-[10.5px] font-normal mt-0.5 ml-[21px]"
            style={{ color: tab === "team" ? "var(--team-dark)" : "#bbbbbb" }}
          >
            팀 공유 · 검수
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
            My box
          </span>
          <span
            className="text-[10.5px] font-normal mt-0.5 ml-[20px]"
            style={{ color: tab === "personal" ? "var(--personal-dark)" : "#bbbbbb" }}
          >
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

      {/* 매니저 오버사이트 — 코멘트 · 공유 · 받은편지함 (파트너 홈엔 없는 부분) */}
      {children && <div className="mt-10 pt-6 border-t border-border">{children}</div>}
    </div>
  );
}

function TeamTab({ files }: { files: MyRecentFile[] }) {
  const review = files.filter((f) => !f.approved && !f.needsNewVersion).length;
  const revise = files.filter((f) => f.needsNewVersion).length;
  const approved = files.filter((f) => f.approved).length;
  return (
    <div>
      <UploadBar
        href="/team?upload=1"
        color="#e85008"
        soft="#fef0e8"
        label="비모 프로젝트에 올리기"
        sub="팀이 보고 검수를 진행합니다"
      />
      {files.length > 0 && (
        <p className="text-[11.5px] text-text-faint mt-3 px-0.5">
          검수 중 {review} · 수정 요청 {revise} · 승인 {approved}
        </p>
      )}
      <SectionHeader label="최근 작업물" count={files.length} />
      {files.length === 0 ? (
        <p className="text-[12.5px] text-text-faint py-10 text-center">
          아직 비모 프로젝트에 올린 작업물이 없습니다
        </p>
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
        <SeeAllLink href="/team" color="var(--team-color)" label="비모 프로젝트에서 모두 보기" />
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
