"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Keyboard } from "lucide-react";

type ShortcutSection = {
  title: string;
  shortcuts: { keys: string[]; desc: string }[];
};

const SECTIONS: ShortcutSection[] = [
  {
    title: "전역",
    shortcuts: [
      { keys: ["⌘", "K"], desc: "빠른 검색 팔레트" },
      { keys: ["?"], desc: "이 단축키 도움말" },
      { keys: ["Esc"], desc: "모달·선택·검색 닫기" },
    ],
  },
  {
    title: "파일 리스트",
    shortcuts: [
      { keys: ["⌘", "A"], desc: "전체 선택" },
      { keys: ["Shift", "+클릭"], desc: "범위 선택" },
      { keys: ["⌘", "+클릭"], desc: "토글 선택" },
      { keys: ["길게 누르기"], desc: "모바일 선택 모드" },
    ],
  },
  {
    title: "영상 검수",
    shortcuts: [
      { keys: ["J"], desc: "다음 영상" },
      { keys: ["K"], desc: "이전 영상" },
      { keys: ["↓"], desc: "다음 영상 (J 와 동일)" },
      { keys: ["↑"], desc: "이전 영상 (K 와 동일)" },
    ],
  },
];

function isFormTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  if (!el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={
        <span className="flex items-center gap-2">
          <Keyboard size={15} strokeWidth={2.2} />
          키보드 단축키
        </span>
      }
      maxWidth="max-w-lg"
    >
      <div className="p-5 grid gap-5 sm:grid-cols-2">
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="text-[10.5px] font-bold tracking-widest uppercase text-text-faint mb-2">
              {sec.title}
            </div>
            <ul className="space-y-1.5">
              {sec.shortcuts.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-[12.5px] text-text-muted"
                >
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="font-mono text-[10.5px] bg-white border border-border rounded px-1.5 py-0.5 text-text-soft min-w-[18px] text-center"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span className="flex-1">{s.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 text-[11px] text-text-faint">
        Tip: 입력 필드에선 단축키가 작동하지 않습니다.
      </div>
    </Modal>
  );
}
