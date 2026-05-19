"use client";

import { useCallback, useRef } from "react";

/**
 * 모바일 길게 누르기 훅. 500ms 누르면 onLongPress 호출.
 * 이동 거리(threshold px) 초과하면 취소 (스크롤 의도).
 */
export function useLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  options?: { delayMs?: number; thresholdPx?: number },
) {
  const delay = options?.delayMs ?? 500;
  const threshold = options?.thresholdPx ?? 10;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    firedRef.current = false;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 마우스 좌클릭은 길게 누르기 무시 (데스크탑은 체크박스/Shift 클릭으로 충분)
      if (e.pointerType === "mouse") return;
      startRef.current = { x: e.clientX, y: e.clientY };
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        // 진동 피드백
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || !timerRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dx * dx + dy * dy > threshold * threshold) clear();
    },
    [threshold],
  );

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    clear();
  }, []);

  const onPointerCancel = useCallback(() => clear(), []);

  /** 길게 누른 직후의 click 이벤트는 취소 (selection 진입 후 onClick 까지 발동 방지) */
  const consumedClick = () => firedRef.current;

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    consumedClick,
  };
}
