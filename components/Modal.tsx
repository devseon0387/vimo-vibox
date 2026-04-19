"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{ animation: "backdrop-in 180ms ease-out both" }}
      />
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${maxWidth} max-h-full overflow-hidden flex flex-col`}
        style={{ animation: "dialog-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="text-[14.5px] font-bold text-text truncate">{title}</div>
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
