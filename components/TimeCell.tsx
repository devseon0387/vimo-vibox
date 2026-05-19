"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe relative time. 서버는 항상 절대 날짜로 렌더 → hydration mismatch 방지.
 * 클라이언트 mount 이후 "오늘 14:22", "어제" 같은 상대 표기로 swap.
 *
 * Hydration 에러 원인: 서버 TZ(UTC) vs 클라 TZ(KST) 차이로 "오늘/어제" 판정이 갈림.
 * fix: 첫 paint 는 deterministic 한 절대 날짜만, 이후 클라가 자기 TZ로 재계산.
 */
function absoluteDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function relativeTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `오늘 ${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "어제";
  return absoluteDate(ms);
}

export function TimeCell({ ms }: { ms: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? relativeTime(ms) : absoluteDate(ms)}</>;
}
