import Link from "next/link";
import { Package, Users, Upload, ArrowRight, Inbox, MessageCircle } from "lucide-react";

type Variant = "personal" | "team";

type PersonalProps = {
  variant: "personal";
  /** 사용량 (bytes) */
  usedBytes: number;
  /** 쿼터 (bytes) */
  quotaBytes: number;
  /** 파일 수 */
  fileCount: number;
  /** 마지막 업로드 ms — null이면 "아직" */
  lastUploadAt: number | null;
};

type TeamProps = {
  variant: "team";
  /** 검수 대기 N (매니저 한정 — partner는 0) */
  pendingReviews: number;
  /** 새 코멘트 N (내가 올린 비모 영상에 달린 미확인 코멘트) */
  newComments: number;
  /** 진행 중 작업 N */
  inProgress: number;
};

type Props = (PersonalProps | TeamProps) & {
  /** partner는 personal 카드 노출 X (page.tsx에서 제어) */
};

function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(b) / 3));
  return `${(b / Math.pow(1000, i)).toFixed(i <= 1 ? 0 : 1)} ${u[i]}`;
}

function formatRelative(ms: number | null): string {
  if (!ms) return "아직 업로드 없음";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

export function SpaceCard(props: Props) {
  if (props.variant === "personal") {
    const pct = props.quotaBytes > 0 ? Math.min(100, Math.round((props.usedBytes / props.quotaBytes) * 100)) : 0;
    return (
      <div
        className="rounded-xl border-2 overflow-hidden transition hover:shadow-md"
        style={{ borderColor: "rgba(14,165,233,0.3)", background: "linear-gradient(135deg, #f0f9ff 0%, #fff 60%)" }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-lg grid place-items-center text-white"
                style={{ background: "var(--personal)" }}
              >
                <Package size={20} strokeWidth={2.4} />
              </div>
              <div>
                <div className="text-lg font-bold">My box</div>
                <div className="text-xs text-text-faint">개인 파일 — 나만 봄</div>
              </div>
            </div>
            <span className="text-xs text-text-faint">
              {formatBytes(props.usedBytes)} / {formatBytes(props.quotaBytes)}
            </span>
          </div>
          <div className="mt-4">
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--personal-soft)" }}
            >
              <div
                className="h-full transition-all"
                style={{ background: "var(--personal)", width: `${pct}%` }}
              />
            </div>
            <div className="text-2xs text-text-faint mt-1.5">
              {props.fileCount} 파일 · 마지막 업로드 {formatRelative(props.lastUploadAt)}
            </div>
          </div>
          <div
            className="flex items-center gap-2 mt-4 pt-3 border-t"
            style={{ borderColor: "rgba(14,165,233,0.15)" }}
          >
            <Link
              href="/my/box?upload=1"
              className="flex-1 text-white rounded-md py-2 text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
              style={{ background: "var(--personal)" }}
            >
              <Upload size={14} strokeWidth={2.4} /> My box에 올리기
            </Link>
            <Link
              href="/my/box"
              className="px-3 py-2 rounded-md border hover:bg-personal-soft transition"
              style={{ borderColor: "rgba(14,165,233,0.3)", color: "var(--personal-dark)" }}
              aria-label="My box 열기"
            >
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // team
  return (
    <div
      className="rounded-xl border-2 overflow-hidden transition hover:shadow-md"
      style={{ borderColor: "rgba(232,80,8,0.3)", background: "linear-gradient(135deg, #fef0e8 0%, #fff 60%)" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-lg grid place-items-center text-white"
              style={{ background: "var(--team-color)" }}
            >
              <Users size={20} strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-lg font-bold">비모 프로젝트</div>
              <div className="text-xs text-text-faint">팀 공유 — 검수 워크플로</div>
            </div>
          </div>
          <span className="text-xs text-text-faint">진행 {props.inProgress}건</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {props.pendingReviews > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: "#fff7ed", color: "#c2410c" }}
            >
              <Inbox size={11} strokeWidth={2.4} /> 검수 대기 {props.pendingReviews}
            </span>
          )}
          {props.newComments > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: "var(--team-soft)", color: "var(--team-dark)" }}
            >
              <MessageCircle size={11} strokeWidth={2.4} /> 새 코멘트 {props.newComments}
            </span>
          )}
          {props.pendingReviews === 0 && props.newComments === 0 && (
            <span className="text-xs text-text-faint">새 활동 없음</span>
          )}
        </div>
        <div
          className="flex items-center gap-2 mt-4 pt-3 border-t"
          style={{ borderColor: "rgba(232,80,8,0.15)" }}
        >
          <Link
            href="/team?upload=1"
            className="flex-1 text-white rounded-md py-2 text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ background: "var(--team-color)" }}
          >
            <Upload size={14} strokeWidth={2.4} /> 비모 프로젝트에 올리기
          </Link>
          <Link
            href="/team"
            className="px-3 py-2 rounded-md border hover:bg-team-soft transition"
            style={{ borderColor: "rgba(232,80,8,0.3)", color: "var(--team-dark)" }}
            aria-label="비모 프로젝트 열기"
          >
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
