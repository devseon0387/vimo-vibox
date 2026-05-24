"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const PROMPT_KEY = "vinote.installPrompted";

export function PwaInit() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // SW 등록
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((e) => console.warn("[SW] register failed:", e));
    }

    // online 복귀 시 큐 flush 트리거
    function onOnline() {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "FLUSH_SAVE_QUEUE" });
      }
    }
    window.addEventListener("online", onOnline);

    // 설치 프롬프트
    function onBefore(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // 3분 후 노출 (메모리)
      setTimeout(() => {
        try {
          if (localStorage.getItem(PROMPT_KEY) !== "shown") setShow(true);
        } catch {
          setShow(true);
        }
      }, 3 * 60 * 1000);
    }
    window.addEventListener("beforeinstallprompt", onBefore);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeinstallprompt", onBefore);
    };
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
      <Download size={16} className="text-zinc-500" />
      <div>
        <div className="text-sm font-medium">비노트를 앱으로 설치하시겠어요?</div>
        <div className="text-xs text-zinc-500">홈화면에서 풀스크린으로 사용</div>
      </div>
      <button
        onClick={install}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        설치
      </button>
      <button onClick={dismiss} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
        <X size={14} />
      </button>
    </div>
  );
}
