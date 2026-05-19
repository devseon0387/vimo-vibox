import { sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { fileUploads, shareLinks, trafficLog } from "@/lib/db/schema";

export type ActivityKind = "upload" | "share" | "download";

export type ActivityEntry = {
  kind: ActivityKind;
  at: number;
  path: string;
  actorName: string | null;
  meta: string | null;
};

export async function getRecentActivity(limit = 100): Promise<ActivityEntry[]> {
  const limitN = Math.min(Math.max(limit, 10), 500);

  const [uploads, shares, traffic] = await Promise.all([
    db
      .select({
        path: fileUploads.path,
        actorName: fileUploads.uploadedByName,
        at: fileUploads.uploadedAt,
      })
      .from(fileUploads)
      .orderBy(desc(fileUploads.uploadedAt))
      .limit(limitN),
    db
      .select({
        path: shareLinks.filePath,
        title: shareLinks.title,
        token: shareLinks.token,
        at: shareLinks.createdAt,
        mode: shareLinks.mode,
      })
      .from(shareLinks)
      .orderBy(desc(shareLinks.createdAt))
      .limit(limitN),
    db
      .select({
        path: trafficLog.path,
        bytes: trafficLog.bytes,
        source: trafficLog.source,
        at: trafficLog.at,
      })
      .from(trafficLog)
      .where(sql`${trafficLog.source} IN ('download', 'share')`)
      .orderBy(desc(trafficLog.at))
      .limit(limitN),
  ]);

  const merged: ActivityEntry[] = [
    ...uploads.map<ActivityEntry>((u) => ({
      kind: "upload",
      at: u.at.getTime(),
      path: u.path,
      actorName: u.actorName,
      meta: null,
    })),
    ...shares.map<ActivityEntry>((s) => ({
      kind: "share",
      at: s.at.getTime(),
      path: s.path,
      actorName: null,
      meta: `${s.mode}${s.title ? ` · ${s.title}` : ""}`,
    })),
    ...traffic.map<ActivityEntry>((t) => ({
      kind: "download",
      at: t.at.getTime(),
      path: t.path,
      actorName: null,
      meta: `${t.source} · ${formatBytes(t.bytes)}`,
    })),
  ];

  merged.sort((a, b) => b.at - a.at);
  return merged.slice(0, limitN);
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
