"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type ConfirmTone =
  | "default"
  | "danger"
  | "warning"
  | "success"
  | "accent"
  | "neutral";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 하위호환: variant="danger" → tone="danger" */
  variant?: "default" | "danger";
  /** 맥락색. 위험도/성격에 맞춰 아이콘·버튼 색이 바뀜 */
  tone?: ConfirmTone;
  /** 동심원 아이콘 교체(미지정 시 tone 기본 아이콘) */
  icon?: LucideIcon;
  /** 대상 강조 칩(파일명·링크 등) — 제목/본문 아래 soft pill */
  highlight?: React.ReactNode;
};

type ToneSpec = {
  icon: LucideIcon;
  color: string; // 아이콘 색
  soft: string; // 동심원/칩 배경
  halo: string; // 안쪽 원 그림자
  btn: string; // 주 버튼 배경
  btnShadow: string;
};

const TONES: Record<ConfirmTone, ToneSpec> = {
  default: {
    icon: HelpCircle,
    color: "#52525b",
    soft: "#f4f4f5",
    halo: "rgba(82,82,91,.12)",
    btn: "#111111",
    btnShadow: "rgba(17,17,17,.18)",
  },
  danger: {
    icon: AlertTriangle,
    color: "#dc2626",
    soft: "#fef2f2",
    halo: "rgba(220,38,38,.12)",
    btn: "#dc2626",
    btnShadow: "rgba(220,38,38,.22)",
  },
  warning: {
    icon: AlertTriangle,
    color: "#d97706",
    soft: "#fef3c7",
    halo: "rgba(217,119,6,.16)",
    btn: "#e85008", // 경고라도 진행 동작은 브랜드 주황
    btnShadow: "rgba(232,80,8,.22)",
  },
  success: {
    icon: CheckCircle2,
    color: "#16a34a",
    soft: "#f0fdf4",
    halo: "rgba(22,163,74,.14)",
    btn: "#16a34a",
    btnShadow: "rgba(22,163,74,.22)",
  },
  accent: {
    icon: Info,
    color: "#e85008",
    soft: "#fef0e8",
    halo: "rgba(232,80,8,.14)",
    btn: "#e85008",
    btnShadow: "rgba(232,80,8,.22)",
  },
  neutral: {
    icon: Info,
    color: "#52525b",
    soft: "#f4f4f5",
    halo: "rgba(82,82,91,.12)",
    btn: "#27272a",
    btnShadow: "rgba(39,39,42,.18)",
  },
};

export function useConfirm() {
  const [state, setState] = useState<InternalState>({
    open: false,
    options: { title: "" },
  });

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options: opts, resolver: resolve });
    });
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      state.resolver?.(result);
      setState((s) => ({ ...s, open: false, resolver: undefined }));
    },
    [state.resolver],
  );

  const dialog = (
    <ConfirmDialog open={state.open} options={state.options} onClose={handleClose} />
  );

  return { confirm, dialog };
}

type InternalState = {
  open: boolean;
  options: ConfirmOptions;
  resolver?: (value: boolean) => void;
};

function ConfirmDialog({
  open,
  options,
  onClose,
}: {
  open: boolean;
  options: ConfirmOptions;
  onClose: (ok: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onClose(true);
      }
    };
    window.addEventListener("keydown", handler);
    // 포커스: confirm 버튼
    setTimeout(() => confirmRef.current?.focus(), 30);
    // body 스크롤 잠금
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const tone: ConfirmTone =
    options.tone ?? (options.variant === "danger" ? "danger" : "default");
  const spec = TONES[tone];
  const Icon = options.icon ?? spec.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose(false)}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />

      {/* 포근한 카드 */}
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative bg-white w-full overflow-hidden"
        style={{
          maxWidth: 332,
          borderRadius: 26,
          boxShadow:
            "0 24px 60px -12px rgba(17,17,17,.22),0 4px 12px rgba(17,17,17,.06)",
          padding: "30px 24px 22px",
          textAlign: "center",
          animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* 동심원 아이콘 */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: spec.soft,
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
                boxShadow: `0 2px 8px ${spec.halo}`,
              }}
            >
              <Icon size={28} strokeWidth={2.1} color={spec.color} />
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
          {options.title}
        </h3>

        {options.message && (
          <div
            style={{
              margin: "0 0 18px",
              fontSize: 14,
              lineHeight: 1.65,
              color: "#555",
            }}
          >
            {options.message}
          </div>
        )}

        {options.highlight && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              maxWidth: "100%",
              background: spec.soft,
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 22,
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "#111",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {options.highlight}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
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
              background: spec.btn,
              boxShadow: `0 4px 12px ${spec.btnShadow}`,
            }}
          >
            {options.confirmLabel ?? "확인"}
          </button>
          <button
            onClick={() => onClose(false)}
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
            {options.cancelLabel ?? "취소"}
          </button>
        </div>
      </div>
    </div>
  );
}
