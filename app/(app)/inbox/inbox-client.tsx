"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileVideo,
  MessageSquare,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
} from "lucide-react";

type PendingReview = {
  path: string;
  uploadedBy: string;
  uploadedAt: number;
};

type PendingApproval = {
  id: string;
  filePath: string;
  author: string;
  body: string;
  videoTimeMs: number;
  createdAt: number;
};

type InboxData = {
  pendingReviews: PendingReview[];
  pendingApprovals: PendingApproval[];
  counts: { review: number; approval: number; total: number };
};

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  const d = Math.floor(diff / 86400_000);
  if (d < 7) return `${d}일 전`;
  return new Date(ms).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function formatTc(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function InboxClient() {
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/inbox");
        if (!r.ok) return;
        const json = (await r.json()) as InboxData;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 60_000); // 1분 폴링
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="grid place-items-center py-16 text-text-faint text-[13px]">
        <Loader2 size={18} className="animate-spin mb-2" />
        불러오는 중…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-[13px] text-text-faint">
        받은편지함을 불러올 수 없어요.
      </div>
    );
  }

  if (data.counts.total === 0) {
    return (
      <div className="border border-border bg-white rounded-xl py-16 px-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mb-4">
          <Check size={28} strokeWidth={2.2} />
        </div>
        <div className="text-[15px] font-semibold text-text mb-1">
          처리할 게 없어요
        </div>
        <div className="text-[12.5px] text-text-muted">
          새 영상이 올라오거나 클라이언트 피드백이 달리면 여기에 표시됩니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 검수 대기 */}
      <section>
        <SectionHeader
          icon={<FileVideo size={14} strokeWidth={2.2} />}
          title="검수 대기"
          count={data.counts.review}
          desc="최근 14일 내 올라온 영상 중 아직 매니저가 보지 않은 것"
        />
        {data.pendingReviews.length === 0 ? (
          <EmptyTinyMessage text="모두 검수 완료" />
        ) : (
          <div className="bg-white border border-border rounded-lg divide-y divide-[#f5f5f5]">
            {data.pendingReviews.map((r) => (
              <Link
                key={r.path}
                href={`/vimo-box?path=${encodeURIComponent(r.path)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface transition-colors"
              >
                <FileVideo
                  size={15}
                  strokeWidth={2}
                  className="text-text-soft shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text truncate">
                    {r.path.split("/").pop()}
                  </div>
                  <div className="text-[11px] text-text-faint truncate">
                    {r.uploadedBy} · {formatRelative(r.uploadedAt)}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={2.2}
                  className="text-text-faint shrink-0"
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 승인 대기 */}
      <section>
        <SectionHeader
          icon={<MessageSquare size={14} strokeWidth={2.2} />}
          title="피드백 승인 대기"
          count={data.counts.approval}
          desc="클라이언트가 남긴 댓글 — 승인하거나 순화 후 공개"
        />
        {data.pendingApprovals.length === 0 ? (
          <EmptyTinyMessage text="대기 중인 피드백 없음" />
        ) : (
          <div className="bg-white border border-border rounded-lg divide-y divide-[#f5f5f5]">
            {data.pendingApprovals.map((a) => (
              <Link
                key={a.id}
                href={`/vimo-box?path=${encodeURIComponent(
                  a.filePath,
                )}&t=${a.videoTimeMs}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors"
              >
                <MessageSquare
                  size={15}
                  strokeWidth={2}
                  className="text-text-soft shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text line-clamp-2">
                    {a.body}
                  </div>
                  <div className="text-[11px] text-text-faint truncate mt-0.5">
                    {a.author} · {a.filePath.split("/").pop()} ·{" "}
                    {formatTc(a.videoTimeMs)} · {formatRelative(a.createdAt)}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={2.2}
                  className="text-text-faint shrink-0 mt-1"
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  desc: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <div className="flex items-center gap-2">
        <span className="text-text-soft">{icon}</span>
        <h2 className="text-[14px] font-bold text-text">{title}</h2>
        <span className="text-[11.5px] font-semibold text-accent bg-accent-soft rounded-full px-2 py-0.5 tabular-nums">
          {count}
        </span>
      </div>
      <span className="text-[11px] text-text-faint">{desc}</span>
    </div>
  );
}

function EmptyTinyMessage({ text }: { text: string }) {
  return (
    <div className="bg-white border border-border rounded-lg py-6 text-center text-[12.5px] text-text-faint">
      <Inbox size={16} strokeWidth={2} className="inline-block mr-1.5 mb-0.5" />
      {text}
    </div>
  );
}
