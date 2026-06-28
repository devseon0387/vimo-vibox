"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";

/**
 * 받은편지함 카운트 변화 감지 → 데스크탑 알림 (Notification API).
 *  - 카운트가 증가했을 때만 알림
 *  - 첫 로드 시엔 알림 안 함 (이미 N건 있는 거 다시 알리지 않음)
 *  - 사용자가 권한 거부했으면 무음
 *  - 알림 클릭 시 /inbox 로 포커스
 *
 * SidebarNav 가 1분 폴링 중이라 별도로 폴링하지 않고, 같은 endpoint 결과를 신뢰.
 * 성능 위해 SidebarNav 와 유사한 1분 주기로 폴링 (이중 폴링이지만 가벼움).
 */
const STORAGE_KEY = "vibox.notifyEnabled";

export function InboxDesktopNotifier() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [enabled, setEnabled] = useState(false);
  const lastCountRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setEnabled(v === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/inbox");
        if (!r.ok) return;
        const data = (await r.json()) as { counts?: { total?: number } };
        const next = data.counts?.total ?? 0;
        const prev = lastCountRef.current;
        if (firstLoadRef.current) {
          firstLoadRef.current = false;
          lastCountRef.current = next;
          return;
        }
        if (prev != null && next > prev) {
          const delta = next - prev;
          if (!cancelled && document.visibilityState !== "visible") {
            const n = new Notification("Vibox", {
              body: `매니저가 봐야 할 ${delta}건 새로 도착`,
              tag: "vibox-inbox",
              icon: "/logo.png",
            });
            n.onclick = () => {
              window.focus();
              window.location.href = "/inbox";
              n.close();
            };
          }
        }
        lastCountRef.current = next;
      } catch {}
    };
    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, permission]);

  // 권한 요청 + 토글 — 우상단 작은 버튼 (UI 는 사이드바 풋터에 별도로 만들어도 됨)
  // 여기선 행동만 export. UI 는 별도.
  return null;
}

/**
 * 알림 토글 버튼 — 사이드바·헤더에 붙일 수 있는 작은 버튼.
 * 권한 요청 + localStorage 저장.
 */
export function NotifyToggle() {
  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setEnabled(v === "1");
    } catch {}
  }, []);

  // SSR/하이드레이션 일치 보장 — 마운트 전에는 양쪽 다 null
  if (!mounted) return null;
  if (typeof Notification === "undefined") return null;

  const toggle = async () => {
    if (!enabled) {
      let p = permission;
      if (p === "default") {
        p = await Notification.requestPermission();
        setPermission(p);
      }
      if (p === "granted") {
        setEnabled(true);
        try {
          localStorage.setItem(STORAGE_KEY, "1");
        } catch {}
      }
    } else {
      setEnabled(false);
      try {
        localStorage.setItem(STORAGE_KEY, "0");
      } catch {}
    }
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1 text-2xs text-text-faint hover:text-text-soft px-2 py-0.5 rounded hover:bg-hover transition-colors"
      title={enabled ? "데스크탑 알림 켜짐" : "받은편지함 새 항목 데스크탑 알림"}
    >
      {enabled ? (
        <>
          <Bell size={12} /> 알림 ON
        </>
      ) : (
        <>
          <BellOff size={12} /> 알림 OFF
        </>
      )}
    </button>
  );
}
