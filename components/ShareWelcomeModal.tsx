"use client";

import { useState, useEffect } from "react";
import { Sparkles, MessageSquare, Eye } from "lucide-react";

const STORAGE_KEY = "vibox.guestNameAsked";

/**
 * 공유 링크 첫 방문 시 환영 + 이름 입력 모달.
 *  - localStorage 'vibox.guestNameAsked' 가 없으면 표시
 *  - 이름 입력 후 onSubmit(name) 콜백 → 부모가 guestName 저장
 *  - 익명으로 시작하기도 가능 (이름 빈 채로 닫기)
 */
export function ShareWelcomeModal({
  initialName,
  hasComments,
  onSubmit,
}: {
  initialName: string;
  hasComments: boolean;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    try {
      const asked = localStorage.getItem(STORAGE_KEY);
      if (!asked) setOpen(true);
    } catch {}
  }, []);

  const dismiss = (saveName: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    if (saveName) onSubmit(name.trim());
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-[2px] px-4">
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-accent-soft to-white px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-widest text-accent uppercase mb-1">
            <Sparkles size={12} strokeWidth={2.4} />
            VIBOX 공유 링크
          </div>
          <h2 className="text-[20px] font-bold text-text mb-1">
            반갑습니다
          </h2>
          <p className="text-[13px] text-text-muted leading-relaxed">
            영상을 시청하고{hasComments && (
              <>
                {" "}
                <span className="font-semibold text-text">
                  시간 위에 직접 의견
                </span>
                도
              </>
            )}{" "}
            남길 수 있어요.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <ul className="space-y-2.5">
            <FeatureLine
              icon={<Eye size={14} strokeWidth={2.2} />}
              text="영상 시청은 자유롭게 — 회원가입 필요 없어요"
            />
            {hasComments && (
              <FeatureLine
                icon={<MessageSquare size={14} strokeWidth={2.2} />}
                text="시간 위에 댓글 달면 매니저가 그 위치를 정확히 보고 작업해요"
              />
            )}
          </ul>

          {hasComments && (
            <div>
              <label className="block text-[12px] font-semibold text-text-soft mb-1.5">
                이름 (의견 작성 시 표시)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") dismiss(true);
                }}
                placeholder="예: 박서진 부장님"
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-md text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
              />
              <div className="text-[11px] text-text-faint mt-1">
                나중에 언제든 바꿀 수 있어요
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-2">
          {hasComments && (
            <button
              onClick={() => dismiss(false)}
              className="flex-1 px-4 py-2.5 text-[13.5px] font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
            >
              일단 보기만
            </button>
          )}
          <button
            onClick={() => dismiss(true)}
            disabled={hasComments && !name.trim()}
            className="flex-1 bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 rounded-md text-[13.5px] font-semibold transition-colors"
          >
            {hasComments ? "시작하기" : "계속"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureLine({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] text-text-muted">
      <span className="shrink-0 mt-0.5 text-accent">{icon}</span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}
