"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * 사이드바 상단의 ⌘K 발견성 트리거.
 * 클릭 또는 ⌘K 모두 동일하게 CommandPalette 를 열어줌.
 * (CommandPalette 는 자체적으로 keydown 리스너를 갖고 있어
 *  여기서는 keydown 'k' 를 dispatch 해서 토글 트리거)
 */
export function SidebarSearchTrigger() {
  const [hint, setHint] = useState<"⌘K" | "Ctrl K">("⌘K");

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    setHint(isMac ? "⌘K" : "Ctrl K");
  }, []);

  const trigger = () => {
    // CommandPalette 가 듣는 동일한 keydown 발생
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    });
    window.dispatchEvent(ev);
  };

  return (
    <button
      onClick={trigger}
      className="mx-3 mb-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-border hover:border-border-hover text-text-soft hover:text-text text-[12.5px] transition-colors"
    >
      <Search size={13} strokeWidth={2} />
      <span className="flex-1 text-left">빠른 검색</span>
      <kbd className="font-mono text-[10.5px] text-text-faint bg-surface border border-border rounded px-1 py-0.5">
        {hint}
      </kbd>
    </button>
  );
}
