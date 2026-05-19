"use client";

import { Keyboard } from "lucide-react";

/**
 * 사이드바 하단 — `?` 단축키 힌트 + 클릭 시 도움말 모달 토글.
 * 모달 자체는 ShortcutHelp 컴포넌트가 글로벌 keydown 으로 듣고 있어
 * 여기선 ? key dispatch 만.
 */
export function SidebarShortcutHint() {
  const trigger = () => {
    const ev = new KeyboardEvent("keydown", { key: "?", bubbles: true });
    window.dispatchEvent(ev);
  };

  return (
    <button
      onClick={trigger}
      className="mx-3 mb-2 mt-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] text-text-faint hover:bg-hover hover:text-text-soft transition-colors"
      title="키보드 단축키"
    >
      <Keyboard size={12} strokeWidth={2} />
      <span className="flex-1 text-left">단축키</span>
      <kbd className="font-mono text-[10px] bg-surface border border-border rounded px-1 py-0.5">
        ?
      </kbd>
    </button>
  );
}
