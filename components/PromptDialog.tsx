"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PromptOptions = {
  title: string;
  message?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null; // 에러 메시지 반환
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose(null)}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-[420px] w-full overflow-hidden"
        style={{ animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-text mb-1.5">
            {options.title}
          </h3>
          {options.message && (
            <div className="text-base text-text-muted mb-4 leading-relaxed">
              {options.message}
            </div>
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
            className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          />
          {error && (
            <div className="mt-2 text-sm text-danger">{error}</div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 bg-surface border-t border-border">
          <button
            onClick={() => onClose(null)}
            className="px-4 py-2 text-base font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            {options.cancelLabel ?? "취소"}
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 text-base font-semibold text-white bg-text hover:bg-[#333] rounded-md transition-colors"
          >
            {options.confirmLabel ?? "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
