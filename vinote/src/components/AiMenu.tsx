"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles, ChevronsRight, Wand2, Anchor, AlignLeft, X, Plus, Copy, Check,
} from "lucide-react";
import { runAi } from "@/lib/api";

export type Proposal = {
  id: string;
  action: string;
  text: string;
  createdAt: number;
  insertable: boolean; // 본문 끝 추가 가능 여부
};

export type PolishPreview = {
  selStart: number;
  selEnd: number;
  original: string;
  suggested: string;
};

export type AiActionContext = {
  /** 전체 본문 (다듬기 외 액션의 컨텍스트) */
  body: string;
  /** 선택된 영역 (없으면 null) */
  selection: { start: number; end: number; text: string } | null;
};

type AiAction = "continue" | "polish" | "summary" | "ending" | "suggest";

const ACTIONS: { id: AiAction; label: string; desc: string; icon: React.ReactNode; needsSelection?: boolean }[] = [
  { id: "continue", label: "이어쓰기", desc: "본문 끝부터 자연스럽게 이어가기", icon: <ChevronsRight size={14} /> },
  { id: "polish", label: "선택 다듬기", desc: "선택 영역을 더 자연스럽게", icon: <Wand2 size={14} />, needsSelection: true },
  { id: "summary", label: "요약", desc: "본문 3~4문장 요약", icon: <AlignLeft size={14} /> },
  { id: "ending", label: "마무리 제안", desc: "현재까지 글을 마무리할 한 문장 5개", icon: <Anchor size={14} /> },
];

export function AiMenu({
  open, onClose, ctx, onProposal, onPolish,
}: {
  open: boolean;
  onClose: () => void;
  ctx: AiActionContext;
  onProposal: (p: Proposal) => void;
  onPolish: (p: PolishPreview) => void;
}) {
  const [loading, setLoading] = useState<AiAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function run(action: AiAction) {
    setError(null);
    setLoading(action);
    try {
      if (action === "polish") {
        if (!ctx.selection) {
          setError("선택 영역이 없습니다 — 본문에서 다듬을 부분을 드래그하세요.");
          setLoading(null);
          return;
        }
        const text = await runAi(
          `다음 단락을 더 자연스럽고 흡인력 있게 다듬어주세요. 길이는 비슷하게 유지. 본문만 출력.\n\n${ctx.selection.text}`,
        );
        onPolish({
          selStart: ctx.selection.start,
          selEnd: ctx.selection.end,
          original: ctx.selection.text,
          suggested: text,
        });
        onClose();
        return;
      }
      let prompt = "";
      let insertable = true;
      if (action === "continue") {
        const tail = ctx.body.slice(-2000);
        prompt = `다음은 현재까지 쓴 본문입니다. 자연스럽게 이어서 300~500자 정도 더 써주세요.\n\n${tail || "(아직 비어있음 — 첫 단락부터 시작)"}`;
      } else if (action === "summary") {
        if (!ctx.body.trim()) {
          setError("본문이 비어있습니다.");
          setLoading(null);
          return;
        }
        prompt = `다음 본문을 3~4문장으로 요약하세요. 핵심만.\n\n${ctx.body}`;
        insertable = false;
      } else if (action === "ending") {
        if (!ctx.body.trim()) {
          setError("본문이 비어있습니다.");
          setLoading(null);
          return;
        }
        prompt = `다음 본문을 마무리할 한 문장 5개를 줄바꿈으로 제안하세요. 번호 없이.\n\n${ctx.body}`;
        insertable = false;
      }
      const text = await runAi(prompt);
      onProposal({
        id: Math.random().toString(36).slice(2, 8),
        action: ACTIONS.find((a) => a.id === action)?.label ?? action,
        text,
        createdAt: Date.now(),
        insertable,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-28" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={14} className="text-violet-600" /> AI 어시스트
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
            <X size={14} />
          </button>
        </div>
        <ul className="py-1">
          {ACTIONS.map((a) => {
            const disabled = a.needsSelection && !ctx.selection;
            return (
              <li key={a.id}>
                <button
                  disabled={loading !== null || disabled}
                  onClick={() => run(a.id)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 disabled:opacity-40"
                >
                  <span className="mt-0.5 text-zinc-500">{a.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {loading === a.id ? "생성 중…" : a.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">{a.desc}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>
        )}
        <div className="border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400">
          claude CLI · 컨텍스트: {ctx.body.length.toLocaleString()}자
          {ctx.selection && ` · 선택 ${ctx.selection.text.length}자`}
        </div>
      </div>
    </div>
  );
}

// ───────── Proposal 카드 ─────────

export function ProposalCard({
  proposal, onInsert, onDismiss,
}: {
  proposal: Proposal;
  onInsert: () => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(proposal.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="mb-3 rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {proposal.action}
          </span>
          <span className="text-[11px] text-zinc-400">{rel(proposal.createdAt)}</span>
        </span>
        <div className="flex items-center gap-1">
          <button onClick={copy} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "복사됨" : "복사"}
          </button>
          {proposal.insertable && (
            <button onClick={onInsert} className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-[11px] text-white hover:bg-zinc-700">
              <Plus size={12} /> 본문 끝에 추가
            </button>
          )}
          <button onClick={onDismiss} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X size={12} /></button>
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-sm leading-relaxed text-zinc-800">
        {proposal.text}
      </div>
    </div>
  );
}

// ───────── 다듬기 비교 모달 ─────────

export function PolishDiff({
  preview, onApply, onCancel,
}: {
  preview: PolishPreview;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-3 rounded-md border-2 border-zinc-900 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Wand2 size={14} className="text-zinc-700" /> 선택 영역 다듬기
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onCancel} className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">취소</button>
          <button onClick={onApply} className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs text-white hover:bg-zinc-700">
            <Check size={12} /> 적용
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-100">
        <div className="p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">원본</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{preview.original}</div>
        </div>
        <div className="p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">AI 제안</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">{preview.suggested}</div>
        </div>
      </div>
    </div>
  );
}

function rel(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "방금";
  if (d < 60) return `${d}초 전`;
  return `${Math.floor(d / 60)}분 전`;
}
