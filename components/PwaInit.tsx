"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const PROMPT_KEY = "vibox.installPrompted";

export function PwaInit() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // SW 등록 (production만)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) =>
        console.warn("[SW] register failed:", e),
      );
    }

    function onBefore(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // 5분 후 노출. 한 번 dismiss하면 다시 안 띄움.
      setTimeout(() => {
        try {
          if (localStorage.getItem(PROMPT_KEY) !== "shown") setShow(true);
        } catch {
          setShow(true);
        }
      }, 5 * 60 * 1000);
    }
    window.addEventListener("beforeinstallprompt", onBefore);
    return () => window.removeEventListener("beforeinstallprompt", onBefore);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    try {
      localStorage.setItem(PROMPT_KEY, "shown");
    } catch {
      /* ignore */
    }
    setShow(false);
    setDeferred(null);
  }

  function dismiss() {
    try {
      localStorage.setItem(PROMPT_KEY, "shown");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show || !deferred) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg">
      <Download size={16} className="text-sky-500" />
      <div>
        <div className="text-sm font-medium">비박스를 앱으로 설치하시겠어요?</div>
        <div className="text-xs text-zinc-500">홈화면에서 풀스크린으로 사용</div>
      </div>
      <button
        onClick={install}
        className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
      >
        설치
      </button>
      <button onClick={dismiss} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
        <X size={14} />
      </button>
    </div>
  );
}
