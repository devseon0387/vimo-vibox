"use client";

import Link from "next/link";
import {
  Upload,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { MyRecentFile } from "@/lib/dashboard/queries";

/**
 * 홈(PartnerHome — 파트너·매니저 공용) UI 헬퍼.
 * 상태 배지·포맷 유틸 등 단일 소스. (구 ManagerHome 통합으로 일부 헬퍼는 미사용일 수 있음)
 */

export function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(b) / 3));
  return `${(b / Math.pow(1000, i)).toFixed(i <= 1 ? 0 : 1)} ${u[i]}`;
}

export function formatRelative(ms: number | null): string {
  if (!ms) return "아직 없음";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

/** 비모(team) 파일의 검수 상태 → 배지 스타일. */
export function teamFileStatus(f: MyRecentFile) {
  if (f.approved)
    return { label: "승인됨", bg: "#f0fdf4", color: "#16a34a", Icon: CheckCircle2, cls: "pa-pop" };
  if (f.needsNewVersion) {
    return {
      label: `수정 요청${f.commentCount ? ` ${f.commentCount}` : ""}`,
      bg: "#fff7ed",
      color: "#c2410c",
      Icon: AlertCircle,
      cls: "pa-revise",
    };
  }
  return { label: "검수 중", bg: "#e0f2fe", color: "#0369a1", Icon: Clock, cls: "" };
}

/** 슬림 업로드 바 — 한 줄, 화면을 지배하지 않되 드래그·클릭 업로드를 분명히 안내. */
export function UploadBar({
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
      <span
        className="grid place-items-center w-9 h-9 rounded-lg flex-none"
        style={{ background: color, color: "#fff" }}
      >
        <Upload size={16} strokeWidth={2.3} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold leading-tight" style={{ color }}>
          {label}
        </div>
        <div className="text-xs text-text-faint mt-0.5">{sub}</div>
      </div>
      <ArrowRight
        size={16}
        strokeWidth={2.2}
        className="flex-none text-text-faint transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-1 px-0.5">
      <span className="text-xs font-semibold text-text-faint tracking-wide">{label}</span>
      {count > 0 && <span className="text-xs text-text-faint tabular-nums">{count}개</span>}
    </div>
  );
}

/** 풀 브라우저(/my/box·/team)로 내려가는 드릴인 링크. */
export function SeeAllLink({ href, color, label }: { href: string; color: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-70"
      style={{ color }}
    >
      {label}
      <ArrowRight size={13} strokeWidth={2.2} />
    </Link>
  );
}
