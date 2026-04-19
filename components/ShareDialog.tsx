"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Copy, Check, Link as LinkIcon } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";

type Step = "configure" | "ready";

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
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("configure");
    setExpiresInDays(7);
    setUsePassword(false);
    setPassword("");
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
          expiresInDays: expiresInDays > 0 ? expiresInDays : null,
          password: usePassword && password ? password : undefined,
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

            <div className="mb-6">
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                  className="rounded"
                />
                <span className="text-[12px] font-semibold text-text-soft">
                  비밀번호 걸기
                </span>
              </label>
              {usePassword && (
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="공유할 비밀번호"
                  className="w-full px-3 py-2 border border-border rounded-md text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              )}
            </div>

            {error && (
              <div className="text-[12px] text-danger mb-3">{error}</div>
            )}

            <button
              onClick={create}
              disabled={creating || (usePassword && !password)}
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

            {usePassword && (
              <div className="text-[11.5px] text-text-muted mb-4 bg-warning-soft border border-[#fde68a] rounded-md px-3 py-2">
                비밀번호: <span className="font-mono font-bold">{password}</span>
                <br />
                (받는 분에게 별도로 전달해주세요)
              </div>
            )}

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
