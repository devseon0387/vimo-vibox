"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const SECTIONS = [
  {
    title: "전역",
    rows: [
      { label: "빠른 검색·이동", keys: ["⌘", "K"] },
      { label: "사이드바 접기/펴기", keys: ["⌘", "\\"] },
      { label: "단축키 도움말", keys: ["⌘", "?"] },
    ],
  },
  {
    title: "편집",
    rows: [
      { label: "강제 저장", keys: ["⌘", "S"] },
      { label: "집중 모드", keys: ["⌘", "."] },
      { label: "굵게 / 기울임 / 밑줄", keys: ["⌘", "B"] },
      { label: "들여쓰기 / 내어쓰기", keys: ["⌘", "] / ["] },
    ],
  },
];

export function Cheatsheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold">단축키</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-4 px-5 py-4">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {sec.title}
              </h3>
              <div className="grid gap-1">
                {sec.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700">{r.label}</span>
                    <span className="flex items-center gap-1">
                      {r.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex min-w-[20px] items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-zinc-100 px-5 py-2 text-[10px] text-zinc-400">Esc로 닫기</div>
      </div>
    </div>
  );
}
