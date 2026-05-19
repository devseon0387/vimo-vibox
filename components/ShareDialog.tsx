"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Copy, Check, Link as LinkIcon, Eye, MessageSquare } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";

type Step = "configure" | "ready";
type Mode = "preview" | "full";

export function ShareDialog({
  entry,
  open,
  onClose,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("configure");
  const [mode, setMode] = useState<Mode>("preview");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("configure");
    setMode("preview");
    setExpiresInDays(7);
    setToken(null);
    setCopied(false);
    setError(null);
  }, [open, entry?.path]);

  if (!entry) return null;

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: entry.path,
          mode,
          expiresInDays: expiresInDays > 0 ? expiresInDays : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "생성 실패");
        return;
      }
      setToken(body.token);
      setStep("ready");
    } finally {
      setCreating(false);
    }
  };

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`
    : "";

  const copyUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <LinkIcon size={15} strokeWidth={2.2} />
          공유 링크 만들기
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="p-6">
        <div className="text-[12px] text-text-faint mb-1">파일</div>
        <div className="text-[14px] font-semibold text-text mb-6 truncate">
          {entry.name}
        </div>

        {step === "configure" && (
          <>
            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-text-soft mb-2">
                모드
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("preview")}
                  className={`flex items-start gap-2 p-2.5 rounded-md border text-left transition-colors ${
                    mode === "preview"
                      ? "border-text bg-surface"
                      : "border-border hover:border-border-hover bg-white"
                  }`}
                >
                  <Eye
                    size={14}
                    strokeWidth={2}
                    className={`mt-0.5 shrink-0 ${mode === "preview" ? "text-text" : "text-text-muted"}`}
                  />
                  <div>
                    <div className="text-[12.5px] font-semibold text-text">
                      보기 전용
                    </div>
                    <div className="text-[10.5px] text-text-muted mt-0.5 leading-snug">
                      클라가 영상만 시청. 댓글·피드백 없음
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setMode("full")}
                  className={`flex items-start gap-2 p-2.5 rounded-md border text-left transition-colors ${
                    mode === "full"
                      ? "border-text bg-surface"
                      : "border-border hover:border-border-hover bg-white"
                  }`}
                >
                  <MessageSquare
                    size={14}
                    strokeWidth={2}
                    className={`mt-0.5 shrink-0 ${mode === "full" ? "text-text" : "text-text-muted"}`}
                  />
                  <div>
                    <div className="text-[12.5px] font-semibold text-text">
                      피드백 받기
                    </div>
                    <div className="text-[10.5px] text-text-muted mt-0.5 leading-snug">
                      클라가 시간 위에 댓글·주석 달 수 있음
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-text-soft mb-2">
                만료 기간
              </label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 1, l: "1일" },
                  { v: 7, l: "7일" },
                  { v: 30, l: "30일" },
                  { v: 0, l: "무기한" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setExpiresInDays(o.v)}
                    className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors ${
                      expiresInDays === o.v
                        ? "bg-text text-white border-text"
                        : "bg-white text-text-muted border-border hover:border-border-hover"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-[12px] text-danger mb-3">{error}</div>
            )}

            <button
              onClick={create}
              disabled={creating}
              className="w-full bg-text text-white hover:bg-[#333] disabled:opacity-60 py-2.5 rounded-md text-[14px] font-semibold"
            >
              {creating ? "생성 중..." : "공유 링크 생성"}
            </button>
          </>
        )}

        {step === "ready" && token && (
          <>
            <div className="text-[12.5px] text-success font-semibold mb-3">
              ✓ 링크가 만들어졌습니다
            </div>

            <div className="bg-surface border border-border rounded-md p-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 text-[12.5px] font-mono text-text break-all">
                  {shareUrl}
                </div>
                <button
                  onClick={copyUrl}
                  title="복사"
                  className="shrink-0 p-2 rounded hover:bg-hover text-text-soft hover:text-accent"
                >
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-accent text-white hover:bg-accent-hover py-2.5 rounded-md text-[14px] font-semibold"
            >
              닫기
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
