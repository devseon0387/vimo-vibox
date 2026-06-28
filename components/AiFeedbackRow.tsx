"use client";

import { useEffect, useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Check,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Verdict = "good" | "bad" | "partial";
type ReasonTag =
  | "ocr_misread"
  | "wrong_correction"
  | "context_wrong"
  | "not_a_typo"
  | "partial_fix"
  | "other";

type FeedbackRow = {
  verdict: Verdict;
  reasonTag: ReasonTag | null;
  note: string | null;
};

const REASON_LABELS: Record<ReasonTag, string> = {
  ocr_misread: "OCR이 글자를 잘못 읽음",
  wrong_correction: "수정 제안이 틀림",
  context_wrong: "문맥상 원문이 맞음",
  not_a_typo: "애초에 오타가 아님",
  partial_fix: "일부만 맞음",
  other: "기타",
};

const REASON_ORDER: ReasonTag[] = [
  "ocr_misread",
  "wrong_correction",
  "context_wrong",
  "not_a_typo",
  "partial_fix",
  "other",
];

export function AiFeedbackRow({ commentId }: { commentId: string }) {
  const [feedback, setFeedback] = useState<FeedbackRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reasonTag, setReasonTag] = useState<ReasonTag>("ocr_misread");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/comments/${commentId}/ai-feedback`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const fb = d.feedback as FeedbackRow | null;
        setFeedback(fb);
        if (fb && (fb.verdict === "bad" || fb.verdict === "partial")) {
          if (fb.reasonTag) setReasonTag(fb.reasonTag);
          if (fb.note) setNote(fb.note);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [commentId]);

  const submit = async (
    verdict: Verdict,
    tag: ReasonTag | null,
    n: string | null,
  ) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/comments/${commentId}/ai-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, reasonTag: tag, note: n }),
      });
      if (res.ok) {
        setFeedback({ verdict, reasonTag: tag, note: n });
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await fetch(`/api/comments/${commentId}/ai-feedback`, {
        method: "DELETE",
      });
      setFeedback(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  // 평가 있고 편집 모드 아니면 — 현재 평가 표시 + 변경 액션
  if (feedback && !editing) {
    const isGood = feedback.verdict === "good";
    return (
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded ${
            isGood
              ? "bg-success-soft text-success border border-emerald-200"
              : "bg-danger-soft text-danger border border-rose-200"
          }`}
        >
          {isGood ? (
            <ThumbsUp size={10} strokeWidth={2.3} />
          ) : (
            <ThumbsDown size={10} strokeWidth={2.3} />
          )}
          {isGood
            ? "정확"
            : feedback.reasonTag
              ? REASON_LABELS[feedback.reasonTag]
              : "부정확"}
        </span>
        {feedback.note && (
          <span className="text-2xs text-text-muted truncate max-w-[200px]" title={feedback.note}>
            “{feedback.note}”
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          disabled={saving}
          className="text-2xs text-text-faint hover:text-text underline decoration-dotted underline-offset-2"
        >
          변경
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            clear();
          }}
          disabled={saving}
          className="text-2xs text-text-faint hover:text-danger"
          title="평가 취소"
        >
          <X size={10} strokeWidth={2.3} />
        </button>
      </div>
    );
  }

  // 편집 모드 — 부정확 사유 선택
  if (editing) {
    return (
      <div
        className="mt-2 p-2 rounded border border-rose-200 bg-danger-soft/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertCircle size={11} className="text-danger" strokeWidth={2.3} />
          <span className="text-xs font-bold text-danger">
            어느 부분이 잘못됐나요?
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1 mb-2">
          {REASON_ORDER.map((tag) => (
            <label
              key={tag}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-white px-1 py-0.5 rounded"
            >
              <input
                type="radio"
                name={`reason-${commentId}`}
                checked={reasonTag === tag}
                onChange={() => setReasonTag(tag)}
                className="w-3 h-3"
              />
              <span className="text-text-soft">{REASON_LABELS[tag]}</span>
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="더 자세한 설명 (선택)"
          rows={2}
          className="w-full text-xs px-2 py-1 border border-border rounded resize-none outline-none focus:border-border-hover"
        />
        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const v: Verdict = reasonTag === "partial_fix" ? "partial" : "bad";
              submit(v, reasonTag, note.trim() || null);
            }}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-danger text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Check size={11} strokeWidth={2.5} />
            )}
            저장
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(false);
            }}
            disabled={saving}
            className="text-xs text-text-muted hover:text-text px-2 py-1"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  // 평가 전 — 두 버튼만
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <span className="text-2xs text-text-faint mr-1">정확?</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          submit("good", null, null);
        }}
        disabled={saving}
        className="inline-flex items-center gap-0.5 text-2xs text-text-muted hover:text-success hover:bg-success-soft px-1.5 py-0.5 rounded transition-colors"
        title="잘 잡았어요"
      >
        <ThumbsUp size={11} strokeWidth={2.2} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        disabled={saving}
        className="inline-flex items-center gap-0.5 text-2xs text-text-muted hover:text-danger hover:bg-danger-soft px-1.5 py-0.5 rounded transition-colors"
        title="잘못 잡았어요"
      >
        <ThumbsDown size={11} strokeWidth={2.2} />
      </button>
    </div>
  );
}
