"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Folder } from "lucide-react";
import {
  type SortKey,
  type SortConfig,
  SORT_LABELS,
} from "@/lib/file-sort";

const KEYS: SortKey[] = ["modified", "name", "size", "kind"];

export function SortDropdown({
  config,
  onChangeKey,
  onToggleOrder,
  onToggleFoldersFirst,
}: {
  config: SortConfig;
  onChangeKey: (k: SortKey) => void;
  onToggleOrder: () => void;
  onToggleFoldersFirst: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-white text-text-soft hover:text-text hover:border-border-hover text-[12.5px] transition-colors"
        title="정렬"
      >
        {config.order === "asc" ? (
          <ArrowUp size={13} strokeWidth={2.2} />
        ) : (
          <ArrowDown size={13} strokeWidth={2.2} />
        )}
        <span>{SORT_LABELS[config.key]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-[200px] bg-white border border-border rounded-md shadow-lg overflow-hidden">
          <div className="py-1">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  if (config.key === k) onToggleOrder();
                  else onChangeKey(k);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-text-muted hover:bg-hover hover:text-text"
              >
                <span className="w-3.5 shrink-0">
                  {config.key === k && (
                    config.order === "asc" ? (
                      <ArrowUp size={12} strokeWidth={2.2} className="text-accent" />
                    ) : (
                      <ArrowDown size={12} strokeWidth={2.2} className="text-accent" />
                    )
                  )}
                </span>
                <span className="flex-1 text-left">{SORT_LABELS[k]}</span>
                {config.key === k && (
                  <span className="text-[10px] text-text-faint">
                    {config.order === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={() => onToggleFoldersFirst(!config.foldersFirst)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-text-muted hover:bg-hover hover:text-text"
            >
              <span className="w-3.5 shrink-0">
                {config.foldersFirst && (
                  <Check size={12} strokeWidth={2.5} className="text-accent" />
                )}
              </span>
              <Folder size={12} strokeWidth={2} className="text-amber-500" />
              <span className="flex-1 text-left">폴더 위로</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
