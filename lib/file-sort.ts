"use client";

import { useEffect, useState, useCallback } from "react";
import type { FileEntry } from "@/lib/fs/storage";

export type SortKey = "name" | "modified" | "size" | "kind";
export type SortOrder = "asc" | "desc";
export type SortConfig = {
  key: SortKey;
  order: SortOrder;
  foldersFirst: boolean;
};

const STORAGE_KEY = "vibox.files.sort";
const DEFAULT: SortConfig = { key: "modified", order: "desc", foldersFirst: true };

function load(): SortConfig {
  if (typeof localStorage === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<SortConfig>;
    return {
      key: (parsed.key as SortKey) ?? DEFAULT.key,
      order: (parsed.order as SortOrder) ?? DEFAULT.order,
      foldersFirst: parsed.foldersFirst ?? DEFAULT.foldersFirst,
    };
  } catch {
    return DEFAULT;
  }
}

function save(cfg: SortConfig) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function useSortConfig(): {
  config: SortConfig;
  setKey: (k: SortKey) => void;
  setOrder: (o: SortOrder) => void;
  toggleOrder: () => void;
  setFoldersFirst: (v: boolean) => void;
} {
  const [config, setConfig] = useState<SortConfig>(DEFAULT);

  useEffect(() => {
    setConfig(load());
  }, []);

  const update = useCallback((patch: Partial<SortConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return {
    config,
    setKey: (k) => update({ key: k }),
    setOrder: (o) => update({ order: o }),
    toggleOrder: () =>
      update({ order: config.order === "asc" ? "desc" : "asc" }),
    setFoldersFirst: (v) => update({ foldersFirst: v }),
  };
}

const KIND_ORDER: Record<string, number> = {
  folder: 0,
  video: 1,
  image: 2,
  audio: 3,
  doc: 4,
  zip: 5,
  other: 6,
};

export function sortEntries(
  entries: FileEntry[],
  cfg: SortConfig,
): FileEntry[] {
  const collator = new Intl.Collator("ko", {
    numeric: true,
    sensitivity: "base",
  });
  const cmp = (a: FileEntry, b: FileEntry): number => {
    if (cfg.foldersFirst) {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    }
    let r = 0;
    switch (cfg.key) {
      case "name":
        r = collator.compare(a.name, b.name);
        break;
      case "modified":
        r = a.modifiedAt - b.modifiedAt;
        break;
      case "size":
        // 폴더는 크기 비교 의미 없음 → 동일 그룹에선 이름으로 fallback
        if (a.isFolder && b.isFolder) {
          r = collator.compare(a.name, b.name);
        } else {
          r = a.size - b.size;
        }
        break;
      case "kind": {
        const ak = KIND_ORDER[a.kind] ?? 99;
        const bk = KIND_ORDER[b.kind] ?? 99;
        r = ak - bk;
        if (r === 0) r = collator.compare(a.name, b.name);
        break;
      }
    }
    return cfg.order === "asc" ? r : -r;
  };
  return [...entries].sort(cmp);
}

export const SORT_LABELS: Record<SortKey, string> = {
  name: "이름",
  modified: "수정일",
  size: "크기",
  kind: "종류",
};
