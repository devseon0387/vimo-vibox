"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Folder, type LucideIcon } from "lucide-react";

export type PromptOptions = {
  title: string;
  message?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null; // 에러 메시지 반환
  /** 동심원 아이콘 교체(미지정 시 폴더) */
  icon?: LucideIcon;
};

type InternalState = {
  open: boolean;
  options: PromptOptions;
  resolver?: (value: string | null) => void;
};

export function usePrompt() {
  const [state, setState] = useState<InternalState>({
    open: false,
    options: { title: "" },
  });

  const promptInput = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setState({ open: true, options: opts, resolver: resolve });
    });
  }, []);

  const handleClose = useCallback(
    (result: string | null) => {
      state.resolver?.(result);
      setState((s) => ({ ...s, open: false, resolver: undefined }));
    },
    [state.resolver],
  );

  const dialog = (
    <PromptDialog open={state.open} options={state.options} onClose={handleClose} />
  );

  return { promptInput, dialog };
}

function PromptDialog({
  open,
  options,
  onClose,
}: {
  open: boolean;
  options: PromptOptions;
  onClose: (value: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(options.defaultValue ?? "");
    setError(null);
    setTimeout(() => inputRef.current?.select(), 30);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, options.defaultValue]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("값을 입력하세요");
      return;
    }
    if (options.validate) {
      const err = options.validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    onClose(trimmed);
  };

  const Icon = options.icon ?? Folder;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose(null)}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />

      {/* 포근한 입력 카드 */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white w-full overflow-hidden"
        style={{
          maxWidth: 360,
          borderRadius: 26,
          boxShadow:
            "0 24px 60px -12px rgba(17,17,17,.22),0 4px 12px rgba(17,17,17,.06)",
          padding: "30px 26px 22px",
          textAlign: "center",
          animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* 동심원 아이콘 */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#fef0e8",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#fff",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 2px 8px rgba(232,80,8,.14)",
              }}
            >
              <Icon size={26} strokeWidth={2.1} color="#e85008" />
            </div>
          </div>
        </div>

        <h3
          style={{
            margin: options.message ? "0 0 6px" : "0 0 14px",
            fontSize: 18,
            fontWeight: 800,
            color: "#111",
            letterSpacing: "-.01em",
          }}
        >
          {options.title}
        </h3>

        {options.message && (
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "#888",
            }}
          >
            {options.message}
          </p>
        )}

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose(null);
            }
          }}
          placeholder={options.placeholder}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "13px 15px",
            border: `1.5px solid ${error ? "#dc2626" : "#e85008"}`,
            borderRadius: 14,
            fontSize: 15,
            color: "#111",
            outline: "none",
            boxShadow: `0 0 0 3px ${error ? "#fef2f2" : "#fef0e8"}`,
            textAlign: "center",
            fontFamily: "inherit",
          }}
        />

        {error && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            marginTop: 18,
          }}
        >
          <button
            onClick={submit}
            className="transition-[filter] hover:brightness-95"
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
            {options.confirmLabel ?? "확인"}
          </button>
          <button
            onClick={() => onClose(null)}
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
