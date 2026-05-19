import { desc, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks, shareViews } from "@/lib/db/schema";

export type VisitorStat = {
  visitorId: string;
  ip: string | null;
  userAgent: string | null;
  openedAt: number;
  lastEventAt: number;
  maxPositionSec: number;
  totalWatchSec: number;
  durationSec: number | null;
  completed: boolean;
};

export type ShareIntel = {
  shareId: string | null;
  shareToken: string;
  title: string | null;
  filePath: string;
  mode: "preview" | "full" | null;
  expiresAt: number | null;
  expired: boolean;
  createdAt: number | null;
  totalVisitors: number;
  totalWatchSec: number;
  completedCount: number;
  lastEventAt: number;
  visitors: VisitorStat[];
};

// 90일 retention — 그 이전 view는 노이즈로 무시
const RETENTION_DAYS = 90;
const MAX_VIEWS = 5000;

export async function getShareIntel(): Promise<ShareIntel[]> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000);

  // 시간 범위 + LIMIT으로 무한 스캔 방지
  const views = await db
    .select()
    .from(shareViews)
    .where(gte(shareViews.lastEventAt, cutoff))
    .orderBy(desc(shareViews.lastEventAt))
    .limit(MAX_VIEWS);

  if (views.length === 0) return [];

  // share_token + file_path 단위 그룹
  const groupKey = (token: string, fp: string) => `${token}::${fp}`;
  const groups = new Map<string, VisitorStat[]>();
  for (const v of views) {
    const k = groupKey(v.shareToken, v.filePath);
    const arr = groups.get(k) ?? [];
    arr.push({
      visitorId: v.visitorId,
      ip: v.ip,
      userAgent: v.userAgent,
      openedAt: v.openedAt.getTime(),
      lastEventAt: v.lastEventAt.getTime(),
      maxPositionSec: v.maxPositionSec,
      totalWatchSec: v.totalWatchSec,
      durationSec: v.durationSec,
      completed: v.completed,
    });
    groups.set(k, arr);
  }

  // share 메타를 한 번의 IN 쿼리로 (N+1 제거)
  const tokens = Array.from(new Set(views.map((v) => v.shareToken)));
  const linkRows =
    tokens.length > 0
      ? await db
          .select({
            id: shareLinks.id,
            token: shareLinks.token,
            title: shareLinks.title,
            mode: shareLinks.mode,
            expiresAt: shareLinks.expiresAt,
            createdAt: shareLinks.createdAt,
          })
          .from(shareLinks)
          .where(inArray(shareLinks.token, tokens))
      : [];
  const linkByToken = new Map<string, (typeof linkRows)[number]>();
  for (const row of linkRows) {
    linkByToken.set(row.token, row);
  }

  const out: ShareIntel[] = [];
  for (const [key, visitors] of groups.entries()) {
    const [token, filePath] = key.split("::");
    const link = linkByToken.get(token);
    visitors.sort((a, b) => b.lastEventAt - a.lastEventAt);

    const expiresAtMs = link?.expiresAt ? link.expiresAt.getTime() : null;
    const expired = expiresAtMs !== null && expiresAtMs < Date.now();
    out.push({
      shareId: link?.id ?? null,
      shareToken: token,
      title: link?.title ?? null,
      filePath,
      mode: link?.mode ?? null,
      expiresAt: expiresAtMs,
      expired,
      createdAt: link?.createdAt ? link.createdAt.getTime() : null,
      totalVisitors: visitors.length,
      totalWatchSec: visitors.reduce((s, v) => s + v.totalWatchSec, 0),
      completedCount: visitors.filter((v) => v.completed).length,
      lastEventAt: visitors[0]?.lastEventAt ?? 0,
      visitors,
    });
  }

  out.sort((a, b) => b.lastEventAt - a.lastEventAt);
  return out;
}
