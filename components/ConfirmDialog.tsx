"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type InternalState = {
  open: boolean;
  options: ConfirmOptions;
  resolver?: (value: boolean) => void;
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

  const isDanger = options.variant === "danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose(false)}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />

      {/* Card */}
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-[400px] w-full overflow-hidden"
        style={{ animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <div className="p-6">
          <div className="flex items-start gap-3.5 mb-3">
            {isDanger && (
              <div className="w-10 h-10 rounded-full bg-danger-soft grid place-items-center shrink-0">
                <AlertTriangle size={20} strokeWidth={2.2} className="text-danger" />
              </div>
            )}
            <div className="flex-1 pt-0.5">
              <h3 className="text-[15.5px] font-bold text-text mb-1.5">
                {options.title}
              </h3>
              {options.message && (
                <div className="text-[13.5px] text-text-muted leading-relaxed">
                  {options.message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 bg-surface border-t border-border">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2 text-[13px] font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            {options.cancelLabel ?? "취소"}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`px-4 py-2 text-[13px] font-semibold text-white rounded-md transition-colors ${
              isDanger
                ? "bg-danger hover:bg-[#b91c1c]"
                : "bg-text hover:bg-[#333]"
            }`}
          >
            {options.confirmLabel ?? "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
