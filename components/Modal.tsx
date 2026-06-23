"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const EXIT_MS = 200;

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  // open 변화 감지: open=true → 즉시 mount, open=false → exit 후 unmount
  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      const t = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Esc 키 + body overflow lock — 보이는 동안만
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{
          animation: exiting
            ? "backdrop-out 180ms ease-in both"
            : "backdrop-in 180ms ease-out both",
        }}
      />
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${maxWidth} max-h-full overflow-hidden flex flex-col`}
        style={{
          animation: exiting
            ? "dialog-out 200ms cubic-bezier(0.4, 0, 1, 1) both"
            : "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="text-md font-bold text-text truncate">{title}</div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-hover text-text-soft hover:text-text transition-colors shrink-0"
              title="닫기 (Esc)"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
