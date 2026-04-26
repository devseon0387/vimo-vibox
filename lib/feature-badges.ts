"use client";

/**
 * 신기능 NEW 배지 — localStorage 기반 사용자별 본 적 기록.
 *
 * 등록된 기능 키마다 release 일자가 있고, 사용자가 그 기능을 한 번도 안 본 채로
 * release 후 N 일 안이라면 NEW 배지 노출.
 */

export type FeatureKey =
  | "command-palette"
  | "multi-select"
  | "folder-zip"
  | "video-keynav"
  | "global-upload"
  | "undo-toast"
  | "shortcut-help"
  | "my-stats"
  | "encoding-card";

type Feature = {
  key: FeatureKey;
  releasedAt: string; // ISO date
  /** 해제 조건: 이 기간(일) 지나면 무조건 사라짐 */
  expireDays: number;
};

export const FEATURES: Record<FeatureKey, Feature> = {
  "command-palette": { key: "command-palette", releasedAt: "2026-04-26", expireDays: 21 },
  "multi-select": { key: "multi-select", releasedAt: "2026-04-26", expireDays: 21 },
  "folder-zip": { key: "folder-zip", releasedAt: "2026-04-26", expireDays: 21 },
  "video-keynav": { key: "video-keynav", releasedAt: "2026-04-26", expireDays: 21 },
  "global-upload": { key: "global-upload", releasedAt: "2026-04-26", expireDays: 21 },
  "undo-toast": { key: "undo-toast", releasedAt: "2026-04-26", expireDays: 21 },
  "shortcut-help": { key: "shortcut-help", releasedAt: "2026-04-26", expireDays: 21 },
  "my-stats": { key: "my-stats", releasedAt: "2026-04-25", expireDays: 21 },
  "encoding-card": { key: "encoding-card", releasedAt: "2026-04-25", expireDays: 21 },
};

const STORAGE_KEY = "vibox.seenFeatures";

function loadSeen(): Set<FeatureKey> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as FeatureKey[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<FeatureKey>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seen)));
  } catch {}
}

/** 해당 기능 봤다고 표시 (배지 사라짐) */
export function markFeatureSeen(key: FeatureKey) {
  const seen = loadSeen();
  if (seen.has(key)) return;
  seen.add(key);
  saveSeen(seen);
  // 같은 탭 내 다른 컴포넌트에 알림
  window.dispatchEvent(
    new CustomEvent("vibox:feature-seen", { detail: { key } }),
  );
}

/** 이 기능 NEW 배지를 표시해야 하는가? (release 후 N일 + 미열람) */
export function shouldShowBadge(key: FeatureKey, seen: Set<FeatureKey>): boolean {
  const f = FEATURES[key];
  if (!f) return false;
  if (seen.has(key)) return false;
  const released = new Date(f.releasedAt).getTime();
  const expire = released + f.expireDays * 86400_000;
  return Date.now() <= expire;
}

import { useEffect, useState } from "react";

/** 컴포넌트 hook: 해당 기능 NEW 배지 노출 여부 + mark 함수 */
export function useFeatureBadge(key: FeatureKey): {
  show: boolean;
  markSeen: () => void;
} {
  const [seen, setSeen] = useState<Set<FeatureKey>>(() => loadSeen());

  useEffect(() => {
    const onChange = () => setSeen(loadSeen());
    window.addEventListener("vibox:feature-seen", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("vibox:feature-seen", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    show: shouldShowBadge(key, seen),
    markSeen: () => markFeatureSeen(key),
  };
}
