"use client";

import { useEffect, useState } from "react";
import { Sparkles, Upload, Search, Inbox, X } from "lucide-react";

const STORAGE_KEY = "vibox.welcomeDismissed";

export function WelcomeCard({ name }: { name?: string | null }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setDismissed(v === "1");
    } catch {
      setDismissed(true);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  if (dismissed) return null;

  return (
    <div className="relative bg-gradient-to-br from-accent-soft to-white border border-accent/20 rounded-xl p-4 sm:p-5 mb-5 overflow-hidden">
      <button
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 p-1.5 rounded text-text-soft hover:text-text hover:bg-white/60"
        title="닫기"
      >
        <X size={14} strokeWidth={2.2} />
      </button>
      <div className="flex items-center gap-2 text-[11px] sm:text-[12px] font-bold text-accent uppercase tracking-wider mb-1">
        <Sparkles size={13} strokeWidth={2.4} />
        Vibox 시작 가이드
      </div>
      <h2 className="text-[16px] sm:text-[18px] font-bold text-text mb-3 pr-7">
        반갑습니다{name ? `, ${name}님` : ""} 👋
      </h2>
      <div className="grid sm:grid-cols-3 gap-2 sm:gap-3">
        <Step
          icon={<Upload size={15} strokeWidth={2.2} />}
          step={1}
          title="영상 올리기"
          desc="우측 위 업로드 버튼 또는 화면에 드래그"
        />
        <Step
          icon={<Inbox size={15} strokeWidth={2.2} />}
          step={2}
          title="검수·피드백"
          desc="영상 클릭 → 댓글·주석으로 피드백"
        />
        <Step
          icon={<Search size={15} strokeWidth={2.2} />}
          step={3}
          title="빠른 검색 ⌘K"
          desc="언제든 ⌘K 로 파일·댓글·페이지 찾기"
        />
      </div>
      <div className="hidden sm:block mt-3 text-[11.5px] text-text-faint">
        Tip: 단축키는 <kbd className="font-mono bg-white border border-border rounded px-1 py-0.5 text-[10.5px]">?</kbd> 키로 언제든 확인.
      </div>
    </div>
  );
}

function Step({
  icon,
  step,
  title,
  desc,
}: {
  icon: React.ReactNode;
  step: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-2.5 bg-white/70 backdrop-blur border border-white rounded-lg p-2.5 sm:p-3">
      <div className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-accent text-white grid place-items-center text-[10px] sm:text-[11px] font-bold">
        {step}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12px] sm:text-[12.5px] font-semibold text-text mb-0.5">
          <span className="text-accent">{icon}</span>
          {title}
        </div>
        <div className="text-[11px] text-text-muted leading-snug">{desc}</div>
      </div>
    </div>
  );
}
