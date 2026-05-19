"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, X, AlertCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: React.ReactNode;
  action?: ToastAction;
  exiting: boolean;
};

type ToastOptions = {
  /** 노출 시간 (ms). 기본 3000. action 있으면 자동으로 5000 */
  durationMs?: number;
  /** 되돌리기 같은 보조 액션. label + onClick */
  action?: ToastAction;
};

type ToastContextValue = {
  show: (
    message: React.ReactNode,
    kindOrOptions?: ToastKind | (ToastOptions & { kind?: ToastKind }),
    legacyOptions?: ToastOptions,
  ) => void;
  success: (message: React.ReactNode, options?: ToastOptions) => void;
  error: (message: React.ReactNode, options?: ToastOptions) => void;
  info: (message: React.ReactNode, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_SHOW_MS = 3000;
const ACTION_SHOW_MS = 5000; // 되돌리기 등 액션 있을 때
const EXIT_MS = 280; // toast-out 키프레임 길이와 일치

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cleanup = (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    const r = timersRef.current.get(id + ":remove");
    if (r) {
      clearTimeout(r);
      timersRef.current.delete(id + ":remove");
    }
  };

  const dismiss = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    // exit 애니메이션 끝나면 제거
    const removeTimer = setTimeout(() => cleanup(id), EXIT_MS);
    timersRef.current.set(id + ":remove", removeTimer);
  }, []);

  const show = useCallback(
    (
      message: React.ReactNode,
      kindOrOptions?: ToastKind | (ToastOptions & { kind?: ToastKind }),
      legacyOptions?: ToastOptions,
    ) => {
      let kind: ToastKind = "success";
      let options: ToastOptions = {};
      if (typeof kindOrOptions === "string") {
        kind = kindOrOptions;
        options = legacyOptions ?? {};
      } else if (kindOrOptions && typeof kindOrOptions === "object") {
        kind = kindOrOptions.kind ?? "success";
        options = kindOrOptions;
      }
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [
        ...prev,
        { id, kind, message, action: options.action, exiting: false },
      ]);
      const duration =
        options.durationMs ??
        (options.action ? ACTION_SHOW_MS : DEFAULT_SHOW_MS);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback(
    (m: React.ReactNode, opts?: ToastOptions) =>
      show(m, { ...opts, kind: "success" }),
    [show],
  );
  const error = useCallback(
    (m: React.ReactNode, opts?: ToastOptions) =>
      show(m, { ...opts, kind: "error" }),
    [show],
  );
  const info = useCallback(
    (m: React.ReactNode, opts?: ToastOptions) =>
      show(m, { ...opts, kind: "info" }),
    [show],
  );

  // 정리: 언마운트 시 모든 타이머 클리어
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto bg-white border border-border text-text pl-4 pr-1.5 py-1.5 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.10),0_2px_4px_rgba(0,0,0,0.05)] min-w-[260px] max-w-[560px] flex items-center gap-3 will-change-transform ${
              t.exiting ? "pointer-events-none" : ""
            }`}
            style={{
              transformOrigin: "center bottom",
              animation: t.exiting
                ? "toast-out 280ms cubic-bezier(0.32, 0, 0.67, 0) both"
                : "toast-in 580ms cubic-bezier(0.5, 1.6, 0.4, 1) both",
            }}
            role="status"
          >
            <IconFor kind={t.kind} />
            <div className="flex-1 text-[12.5px] leading-relaxed break-all font-medium">
              {t.message}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  try {
                    t.action!.onClick();
                  } finally {
                    dismiss(t.id);
                  }
                }}
                className="shrink-0 px-3 py-1 rounded-full text-[12px] font-bold text-accent hover:bg-accent-soft transition-colors"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 rounded-full hover:bg-hover text-text-muted hover:text-text transition-colors"
              aria-label="닫기"
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function IconFor({ kind }: { kind: ToastKind }) {
  const base =
    "shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center text-white";
  if (kind === "success") {
    return (
      <span className={`${base} bg-success`}>
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }
  if (kind === "error") {
    return (
      <span className={`${base} bg-danger`}>
        <AlertCircle size={11} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={`${base} bg-[#3b82f6]`}>
      <Info size={11} strokeWidth={2.5} />
    </span>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
