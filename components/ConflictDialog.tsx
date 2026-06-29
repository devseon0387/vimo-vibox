"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { ConflictMode } from "@/lib/upload";

export function ConflictDialog({
  open,
  conflicts,
  onChoose,
  onCancel,
}: {
  open: boolean;
  conflicts: string[]; // 충돌 파일 절대 경로 리스트
  onChoose: (mode: ConflictMode) => void;
  onCancel: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    setTimeout(() => primaryRef.current?.focus(), 30);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  const n = conflicts.length;
  const firstName = conflicts[0]?.split("/").pop() ?? "";
  const chipText = n > 1 ? `${firstName} 외 ${n - 1}개` : firstName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />

      {/* 포근한 충돌 카드 */}
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative bg-white w-full overflow-hidden"
        style={{
          maxWidth: 340,
          borderRadius: 26,
          boxShadow:
            "0 24px 60px -12px rgba(17,17,17,.22),0 4px 12px rgba(17,17,17,.06)",
          padding: "30px 24px 22px",
          textAlign: "center",
          animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* 동심원 아이콘 (amber) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "#fef3c7",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: "50%",
                background: "#fff",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 2px 8px rgba(217,119,6,.16)",
              }}
            >
              <AlertTriangle size={28} strokeWidth={2.1} color="#d97706" />
            </div>
          </div>
        </div>

        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 19,
            fontWeight: 800,
            color: "#111",
            letterSpacing: "-.01em",
          }}
        >
          {n > 1 ? `같은 이름이 ${n}개 있어요` : "같은 이름의 파일이 있어요"}
        </h3>

        <p
          style={{
            margin: "0 0 18px",
            fontSize: 14,
            lineHeight: 1.65,
            color: "#555",
          }}
        >
          이미 올라간 파일과 이름이 겹쳐요.
          <br />
          어떻게 할지 골라 주세요.
        </p>

        {firstName && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              maxWidth: "100%",
              background: "#fef3c7",
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 22,
              boxSizing: "border-box",
            }}
            title={conflicts.join("\n")}
          >
            <span
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#111",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chipText}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button
            ref={primaryRef}
            onClick={() => onChoose("autonumber")}
            className="transition-[filter] hover:brightness-95"
            style={{
              width: "100%",
              padding: 14,
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              border: "none",
              borderRadius: 15,
              cursor: "pointer",
              background: "#e85008",
              boxShadow: "0 4px 12px rgba(232,80,8,.22)",
            }}
          >
            번호 붙여서 둘 다 보관
          </button>
          <button
            onClick={() => onChoose("skip")}
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
            겹치는 건 건너뛰기
          </button>
          <button
            onClick={() => onChoose("overwrite")}
            className="transition-colors hover:bg-[#fef2f2]"
            style={{
              width: "100%",
              padding: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "#dc2626",
              background: "transparent",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            덮어쓰기 (되돌릴 수 없어요)
          </button>
        </div>
      </div>
    </div>
  );
}
