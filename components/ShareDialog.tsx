"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Link as LinkIcon, Eye, MessageSquare } from "lucide-react";
import type { FileEntry } from "@/lib/fs/storage";
import { humanError } from "@/lib/human-error";

type Step = "configure" | "ready";
type Mode = "preview" | "full";

export function ShareDialog({
  entry,
  open,
  onClose,
  onCreated,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
  /** 링크 생성 직후 토큰 회수용 (선택). 기존 호출자는 미전달 → 무회귀. */
  onCreated?: (token: string) => void;
}) {
  const [step, setStep] = useState<Step>("configure");
  const [mode, setMode] = useState<Mode>("preview");
  const [includeFeedback, setIncludeFeedback] = useState(false);
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("configure");
    setMode("preview");
    setIncludeFeedback(false);
    setToken(null);
    setCopied(false);
    setError(null);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, entry?.path, onClose]);

  if (!open || !entry) return null;

  const isFolder = entry.isFolder;

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: entry.path,
          ...(isFolder ? {} : { mode }),
          ...(!isFolder && mode === "full" ? { includeFeedback } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(humanError(body.error, "share"));
        return;
      }
      setToken(body.token);
      setStep("ready");
      if (typeof body.token === "string") onCreated?.(body.token);
    } finally {
      setCreating(false);
    }
  };

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`
    : "";

  const copyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareNote = isFolder
    ? "폴더 공유"
    : mode === "preview"
      ? "미리보기로 공유"
      : "피드백 받기";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />

      {/* 포근한 카드 */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white w-full overflow-hidden"
        style={{
          maxWidth: 340,
          borderRadius: 26,
          boxShadow:
            "0 24px 60px -12px rgba(17,17,17,.22),0 4px 12px rgba(17,17,17,.06)",
          padding: "28px 24px 22px",
          textAlign: "center",
          animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* 동심원 — 설정=주황 링크 / 완료=초록 체크 */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 13 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: step === "ready" ? "#ecfdf3" : "#fef0e8",
              display: "grid",
              placeItems: "center",
              animation:
                step === "ready"
                  ? "dialog-in 380ms cubic-bezier(0.16,1,0.3,1) both"
                  : undefined,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "#fff",
                display: "grid",
                placeItems: "center",
                boxShadow: `0 2px 8px ${
                  step === "ready" ? "rgba(22,163,74,.14)" : "rgba(232,80,8,.14)"
                }`,
              }}
            >
              {step === "ready" ? (
                <Check size={24} strokeWidth={2.6} color="#16a34a" />
              ) : (
                <LinkIcon size={23} strokeWidth={2.1} color="#e85008" />
              )}
            </div>
          </div>
        </div>

        <h3
          style={{
            margin: "0 0 4px",
            fontSize: 18,
            fontWeight: 800,
            color: "#18181b",
            letterSpacing: "-.01em",
          }}
        >
          {step === "ready" ? "공유 링크가 준비됐어요" : "공유 링크 만들기"}
        </h3>
        <p
          className="truncate"
          style={{ margin: "0 0 16px", fontSize: 13, color: "#888" }}
        >
          {entry.name}
          {step === "ready" ? ` · ${shareNote}` : ""}
        </p>

        {/* ===== 설정 ===== */}
        {step === "configure" && (
          <>
            {isFolder ? (
              <div
                style={{
                  textAlign: "left",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "#71717a",
                  background: "#fafafa",
                  border: "1px solid #ececec",
                  borderRadius: 14,
                  padding: "12px 14px",
                  marginBottom: 18,
                }}
              >
                받는 사람이 이 폴더 안의 파일을 탐색하고 다운로드할 수 있어요. 폴더에
                파일을 추가하면 공유에도 자동 반영됩니다.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  textAlign: "left",
                  marginBottom: includeFeedback || mode === "full" ? 12 : 18,
                }}
              >
                <ModeRow
                  active={mode === "preview"}
                  icon={<Eye size={16} strokeWidth={2} color={mode === "preview" ? "#e85008" : "#777"} />}
                  title="보기 전용"
                  desc="영상만 시청 · 댓글·피드백 없음"
                  onClick={() => setMode("preview")}
                />
                <ModeRow
                  active={mode === "full"}
                  icon={<MessageSquare size={16} strokeWidth={2} color={mode === "full" ? "#e85008" : "#777"} />}
                  title="피드백 받기"
                  desc="시간 위에 댓글·주석 가능"
                  onClick={() => setMode("full")}
                />

                {mode === "full" && (
                  <button
                    type="button"
                    onClick={() => setIncludeFeedback((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      textAlign: "left",
                      padding: "11px 13px",
                      borderRadius: 14,
                      border: `1.5px solid ${includeFeedback ? "#e85008" : "transparent"}`,
                      background: includeFeedback ? "#fffaf6" : "#fafafa",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        marginTop: 1,
                        flex: "none",
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        display: "grid",
                        placeItems: "center",
                        background: includeFeedback ? "#e85008" : "#fff",
                        border: `1px solid ${includeFeedback ? "#e85008" : "#d4d4d8"}`,
                      }}
                    >
                      {includeFeedback && (
                        <Check size={11} strokeWidth={3} color="#fff" />
                      )}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#111", lineHeight: 1.45 }}>
                      내가 남긴 피드백도 함께 보이기
                    </span>
                  </button>
                )}
              </div>
            )}

            {error && (
              <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <button
                onClick={create}
                disabled={creating}
                className="transition-[filter] hover:brightness-95 disabled:opacity-60"
                style={{
                  width: "100%",
                  padding: 14,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#e85008",
                  border: "none",
                  borderRadius: 15,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(232,80,8,.22)",
                }}
              >
                {creating ? "만드는 중…" : "링크 만들기"}
              </button>
              <button
                onClick={onClose}
                className="transition-colors hover:bg-[#f0f0f0]"
                style={{
                  width: "100%",
                  padding: 13,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#555",
                  background: "#fafafa",
                  border: "none",
                  borderRadius: 15,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
            </div>
          </>
        )}

        {/* ===== 완료 (A) ===== */}
        {step === "ready" && token && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: "1px solid #ececec",
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 18,
                textAlign: "left",
              }}
            >
              <LinkIcon size={14} strokeWidth={2} color="#a1a1aa" style={{ flex: "none" }} />
              <span
                className="truncate"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  color: "#52525b",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {shareUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <button
                onClick={copyUrl}
                className="transition-[filter] hover:brightness-95"
                style={{
                  width: "100%",
                  padding: 14,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#fff",
                  background: copied ? "#16a34a" : "#e85008",
                  border: "none",
                  borderRadius: 15,
                  cursor: "pointer",
                  boxShadow: `0 4px 12px ${copied ? "rgba(22,163,74,.22)" : "rgba(232,80,8,.22)"}`,
                }}
              >
                {copied ? "복사됨" : "링크 복사"}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:bg-[#f0f0f0]"
                style={{
                  width: "100%",
                  padding: 13,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#555",
                  background: "#fafafa",
                  border: "none",
                  borderRadius: 15,
                  cursor: "pointer",
                  textDecoration: "none",
                  display: "block",
                }}
              >
                열기
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeRow({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 13px",
        borderRadius: 14,
        border: `1.5px solid ${active ? "#e85008" : "transparent"}`,
        background: active ? "#fffaf6" : "#fafafa",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ flex: "none" }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13.5,
            fontWeight: active ? 700 : 600,
            color: "#111",
          }}
        >
          {title}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "#888", marginTop: 1 }}>
          {desc}
        </span>
      </span>
      {active && (
        <Check size={16} strokeWidth={2.4} color="#e85008" style={{ flex: "none" }} />
      )}
    </button>
  );
}
