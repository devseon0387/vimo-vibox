"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CtxItem =
  | {
      kind: "item";
      label: string;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { kind: "separator" };

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  // items가 매 부모 렌더마다 새 배열이라도 listener는 한 번만 등록.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeRef = useRef(activeIdx);
  activeRef.current = activeIdx;

  // 화면 밖으로 살짝 띄워둔 채 첫 렌더 → useLayoutEffect에서 클램프 후 제자리.
  // mounted 게이트를 두면 deps `[x, y]` 미변경으로 클램프가 한 번도 실행되지 않음.
  // viewport 클램프 (오른쪽/아래로 넘치면 끌어당김)
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (x + rect.width > vw - 8) nx = Math.max(8, vw - rect.width - 8);
    if (y + rect.height > vh - 8) ny = Math.max(8, vh - rect.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // outside click + 키보드 (한 번만 등록 — items/activeIdx는 ref로 latest 참조)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      const items = itemsRef.current;
      const enabled = items
        .map((it, i) => (it.kind === "item" && !it.disabled ? i : -1))
        .filter((i) => i >= 0);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (enabled.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((cur) => {
          const i = enabled.indexOf(cur);
          return enabled[(i + 1 + enabled.length) % enabled.length];
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((cur) => {
          const i = enabled.indexOf(cur);
          if (i < 0) return enabled[enabled.length - 1];
          return enabled[(i - 1 + enabled.length) % enabled.length];
        });
      } else if (e.key === "Enter") {
        // 아직 어떤 항목도 활성화되지 않았으면 첫 enabled 실행 (Finder 동작)
        const idx = activeRef.current >= 0 ? activeRef.current : enabled[0];
        if (idx === undefined) return;
        const it = items[idx];
        if (it && it.kind === "item" && !it.disabled) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          it.onSelect();
        }
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    // 우클릭 다른 곳: 메뉴 닫고 새 메뉴 열도록 닫기만 함 (parent가 새로 열게)
    const onContextMenu = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [onClose]);

  // SSR-safe portal: document.body는 client에서만 사용 가능 → typeof check
  if (typeof document === "undefined") return null;

  const node = (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 100,
        transformOrigin: "top left",
        animation: "ctxmenu-in 100ms cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
      className="bg-white border border-border rounded-lg p-1 shadow-[0_6px_18px_rgba(0,0,0,0.10)] min-w-[180px] text-sm select-none"
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.kind === "separator") {
          return <div key={`sep-${i}`} className="h-px bg-border my-1" />;
        }
        const isActive = activeIdx === i;
        const tone = it.danger
          ? "hover:bg-danger-soft hover:text-danger"
          : "hover:bg-accent-soft hover:text-accent";
        const activeTone = it.danger ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent";
        return (
          <button
            key={`it-${i}`}
            type="button"
            disabled={it.disabled}
            onMouseEnter={() => {
              if (!it.disabled) setActiveIdx(i);
            }}
            onMouseLeave={() => {
              if (!it.disabled) setActiveIdx(-1);
            }}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onSelect();
            }}
            className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between gap-3 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-text ${
              isActive ? activeTone : tone
            }`}
            role="menuitem"
          >
            <span>{it.label}</span>
            {it.shortcut && (
              <span className="text-text-faint text-xs font-mono shrink-0">
                {it.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return createPortal(node, document.body);
}
