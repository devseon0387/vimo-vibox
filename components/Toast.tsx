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

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: React.ReactNode;
  exiting: boolean;
};

type ToastContextValue = {
  show: (message: React.ReactNode, kind?: ToastKind) => void;
  success: (message: React.ReactNode) => void;
  error: (message: React.ReactNode) => void;
  info: (message: React.ReactNode) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const SHOW_MS = 3000;
const EXIT_MS = 220;

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
    (message: React.ReactNode, kind: ToastKind = "success") => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { id, kind, message, exiting: false }]);
      const timer = setTimeout(() => dismiss(id), SHOW_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback((m: React.ReactNode) => show(m, "success"), [show]);
  const error = useCallback((m: React.ReactNode) => show(m, "error"), [show]);
  const info = useCallback((m: React.ReactNode) => show(m, "info"), [show]);

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
            className={`pointer-events-auto bg-text text-white px-4 py-2.5 rounded-lg shadow-xl min-w-[260px] max-w-[560px] flex items-center gap-2.5 ${
              t.exiting ? "pointer-events-none" : ""
            }`}
            style={{
              animation: t.exiting
                ? "toast-out 220ms cubic-bezier(0.4, 0, 1, 1) both"
                : "toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
            role="status"
          >
            <IconFor kind={t.kind} />
            <div className="flex-1 text-[13px] leading-relaxed break-all">
              {t.message}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-0.5 rounded hover:bg-white/10 opacity-50 hover:opacity-100 transition-opacity"
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
  if (kind === "success") {
    return <Check size={14} strokeWidth={2.5} className="text-success shrink-0" />;
  }
  if (kind === "error") {
    return (
      <AlertCircle size={14} strokeWidth={2.2} className="text-danger shrink-0" />
    );
  }
  return <Info size={14} strokeWidth={2.2} className="text-[#60a5fa] shrink-0" />;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
