"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const PROMPT_KEY = "vibox.installPrompted";
const IOS_PROMPT_KEY = "vibox.iosInstallPrompted";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ 는 데스크탑 UA 위장. maxTouchPoints 로 보강.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari 전용 plat
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaInit() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) =>
        console.warn("[SW] register failed:", e),
      );
    }

    function onBefore(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setTimeout(() => {
        try {
          if (localStorage.getItem(PROMPT_KEY) !== "shown") setShow(true);
        } catch {
          setShow(true);
        }
      }, 5 * 60 * 1000);
    }
    window.addEventListener("beforeinstallprompt", onBefore);

    // iOS Safari: beforeinstallprompt 미발사 → 수동 안내.
    // 이미 standalone이면 노출 안 함. 한 번 dismiss하면 30일 침묵.
    if (isIos() && !isStandalone()) {
      try {
        const last = Number(localStorage.getItem(IOS_PROMPT_KEY) ?? 0);
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - last > THIRTY_DAYS) {
          // 페이지 로드 직후가 아닌 살짝 늦게 — 다른 UI 안 가리도록
          setTimeout(() => setShowIos(true), 8000);
        }
      } catch {
        setTimeout(() => setShowIos(true), 8000);
      }
    }

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

  function dismissIos() {
    try {
      localStorage.setItem(IOS_PROMPT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShowIos(false);
  }

  return (
    <>
      {show && deferred && (
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
      )}

      {showIos && (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:left-auto sm:right-4 sm:max-w-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50">
              <Download size={18} className="text-sky-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">홈화면에 추가</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-600">
                Safari 하단의 <Share size={12} className="inline align-text-bottom" /> 공유 메뉴를 열고
                <span className="mx-1 inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium">
                  <Plus size={11} /> 홈 화면에 추가
                </span>
                를 누르면 비박스가 앱처럼 설치돼요.
              </div>
            </div>
            <button
              onClick={dismissIos}
              className="-mr-1 -mt-1 rounded p-1 text-zinc-400 hover:bg-zinc-100"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
