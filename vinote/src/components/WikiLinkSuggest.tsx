"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { suggest, type Suggestion } from "@/lib/api";

type Trigger = {
  start: number; // [[ 시작 위치 (ProseMirror pos)
  end: number;   // 현재 커서 위치
  query: string;
  coords: { left: number; top: number; bottom: number };
};

/**
 * 에디터에 `[[` 입력 감지 → suggest API 호출 → caret 위치에 popup.
 * Enter/click 선택 시 `[[제목]]`으로 교체 + 커서 뒤로 이동.
 */
export function WikiLinkSuggest({ editor }: { editor: TiptapEditor | null }) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // editor transaction 마다 [[ 패턴 감지
  useEffect(() => {
    if (!editor) return;
    function onUpdate() {
      if (!editor) return;
      const { from, empty } = editor.state.selection;
      if (!empty) {
        setTrigger(null);
        return;
      }
      // 커서로부터 뒤로 최대 60자 검사 — `[[xxx` 패턴
      const lookback = Math.max(0, from - 60);
      const beforeText = editor.state.doc.textBetween(lookback, from, "\n", "\n");
      // 가장 마지막 [[ 위치
      const idx = beforeText.lastIndexOf("[[");
      if (idx === -1) {
        setTrigger(null);
        return;
      }
      const query = beforeText.slice(idx + 2);
      // 닫는 ]가 있으면 트리거 종료
      if (query.includes("]")) {
        setTrigger(null);
        return;
      }
      // 줄바꿈이 있으면 종료
      if (query.includes("\n")) {
        setTrigger(null);
        return;
      }
      const start = lookback + idx;
      const coords = editor.view.coordsAtPos(from);
      setTrigger({ start, end: from, query, coords: { left: coords.left, top: coords.top, bottom: coords.bottom } });
      setActive(0);
    }
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onUpdate);
    };
  }, [editor]);

  // trigger 변경 시 suggest 호출 (debounce)
  useEffect(() => {
    if (!trigger) {
      setItems([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const s = await suggest(trigger.query, 8);
      setItems(s);
      setActive(0);
    }, 100);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [trigger?.query]);

  // 키보드 ↑↓ Enter Esc
  useEffect(() => {
    if (!trigger || !editor) return;
    function onKey(e: KeyboardEvent) {
      if (!trigger || !editor || items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((v) => Math.min(items.length - 1, v + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((v) => Math.max(0, v - 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const it = items[active];
        if (it) insertLink(it);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setTrigger(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, items, active, editor]);

  function insertLink(it: Suggestion) {
    if (!editor || !trigger) return;
    // [[xxx 부분을 [[제목]] 으로 교체 + 커서 이동
    editor
      .chain()
      .focus()
      .insertContentAt({ from: trigger.start, to: trigger.end }, `[[${it.title}]]`)
      .run();
    setTrigger(null);
    setItems([]);
  }

  if (!trigger || items.length === 0) return null;

  return (
    <div
      className="fixed z-50 w-72 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl"
      style={{
        left: Math.min(window.innerWidth - 300, trigger.coords.left),
        top: trigger.coords.bottom + 4,
      }}
    >
      <div className="border-b border-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        노트 링크
      </div>
      <ul>
        {items.map((s, i) => (
          <li key={s.path}>
            <button
              onClick={() => insertLink(s)}
              onMouseEnter={() => setActive(i)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${
                i === active ? "bg-zinc-100" : ""
              }`}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-zinc-100 px-3 py-1 text-[10px] text-zinc-400">
        ↑↓ Enter · Esc 닫기
      </div>
    </div>
  );
}
