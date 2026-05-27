"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Url);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "loading" | "unsupported" | "denied" | "default" | "subscribed";

export function PushBell({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (typeof Notification === "undefined") {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "subscribed" : "default"))
      .catch(() => setStatus("default"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "default");
        return;
      }
      const r = await fetch("/api/push/vapid-key");
      if (!r.ok) {
        alert("푸시 알림이 서버에서 비활성화돼 있어요. 운영자에게 문의하세요.");
        return;
      }
      const { key } = (await r.json()) as { key: string };
      const reg = await navigator.serviceWorker.ready;
      // Uint8Array → ArrayBuffer (TS DOM lib 의 BufferSource 와 호환)
      const keyBytes = urlBase64ToUint8Array(key);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength,
        ) as ArrayBuffer,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setStatus("subscribed");
    } catch (e) {
      console.warn("[Push] enable failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("default");
    } catch (e) {
      console.warn("[Push] disable failed:", e);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported") return null;

  const base =
    className ??
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition";

  if (status === "denied") {
    return (
      <span
        className={`${base} border-zinc-200 bg-white text-zinc-400`}
        title="브라우저 설정에서 알림 차단을 해제하세요"
      >
        <BellOff size={14} /> 알림 차단됨
      </span>
    );
  }

  if (status === "subscribed") {
    return (
      <button
        type="button"
        onClick={disable}
        disabled={busy}
        className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50`}
      >
        <BellRing size={14} /> 알림 받는 중
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className={`${base} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50`}
    >
      <Bell size={14} /> 알림 켜기
    </button>
  );
}
