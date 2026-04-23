import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { trafficLog, shareLinks, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { getStorageRoot } from "@/lib/fs/storage";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function startOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 스토리지 루트 재귀 크기 합계 (dot 파일 포함 — 썸네일 등도 계산에 포함)
async function measureStorage(
  root: string,
): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  async function walk(abs: string) {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = `${abs}/${e.name}`;
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const s = await fs.stat(full);
          bytes += s.size;
          files += 1;
        } catch {}
      }
    }
  }
  await walk(root);
  return { bytes, files };
}

async function diskFree(
  root: string,
): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const statfs = (
      fs as unknown as {
        statfs?: (p: string) => Promise<{
          bsize: number;
          blocks: number;
          bfree: number;
          bavail?: number;
        }>;
      }
    ).statfs;
    if (!statfs) return null;
    const s = await statfs(root);
    return {
      totalBytes: s.blocks * s.bsize,
      freeBytes: (s.bavail ?? s.bfree) * s.bsize,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const today = startOf(new Date(now)).getTime();
  const last7 = today - 6 * DAY_MS;
  const last30 = today - 29 * DAY_MS;

  // 커스텀 날짜 범위 (from/to, unix ms). 없으면 last30 기본.
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const rangeFrom = fromParam ? Number(fromParam) : last30;
  const rangeTo = toParam ? Number(toParam) : now;
  const rangeDays = Math.max(
    1,
    Math.ceil((rangeTo - rangeFrom) / DAY_MS),
  );

  // 총 바이트 (전체)
  const totalRows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog);

  // 오늘
  const todayRows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(gte(trafficLog.at, new Date(today)));

  // 7일
  const last7Rows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(gte(trafficLog.at, new Date(last7)));

  // 30일
  const last30Rows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(gte(trafficLog.at, new Date(last30)));

  // 이번 달
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);
  const thisMonthRows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, thisMonthStart),
        // 업로드(인바운드)는 월 한도 경고 계산에서 제외하고 싶으면 여기 필터 추가
      ),
    );

  // 선택 범위
  const rangeTotalRows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
      ),
    );

  // 실시간 속도 — 최근 1분
  const last1mRows = await db
    .select({
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(gte(trafficLog.at, new Date(now - MINUTE_MS)));
  const liveBytesPerSec = Number(last1mRows[0]?.bytes ?? 0) / 60;

  // 소스별 (선택 범위)
  const bySourceRows = await db
    .select({
      source: trafficLog.source,
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
      ),
    )
    .groupBy(trafficLog.source);

  // 일별 트렌드 (선택 범위, 최대 90일)
  const dayExpr = sql<string>`date(${trafficLog.at} / 1000, 'unixepoch', 'localtime')`;
  const dailyRows = await db
    .select({
      day: dayExpr,
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  // 빠진 날짜 채우기
  const dayLabels: string[] = [];
  const cappedDays = Math.min(rangeDays, 90);
  const chartStart = startOf(new Date(rangeTo)).getTime() - (cappedDays - 1) * DAY_MS;
  for (let i = 0; i < cappedDays; i++) {
    const d = new Date(chartStart + i * DAY_MS);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayLabels.push(label);
  }
  const dailyMap = new Map(
    dailyRows.map((r) => [r.day as string, r]),
  );
  const daily = dayLabels.map((day) => {
    const row = dailyMap.get(day);
    return {
      day,
      bytes: Number(row?.bytes ?? 0),
      count: Number(row?.count ?? 0),
    };
  });

  // TOP 10 파일 (선택 범위, 아웃바운드만)
  const topFilesRows = await db
    .select({
      path: trafficLog.path,
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
        sql`${trafficLog.source} IN ('download', 'share', 'thumb')`,
      ),
    )
    .groupBy(trafficLog.path)
    .orderBy(desc(sql`sum(${trafficLog.bytes})`))
    .limit(10);

  // TOP 공유 링크 (선택 범위)
  const topSharesRows = await db
    .select({
      token: trafficLog.shareToken,
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
        eq(trafficLog.source, "share"),
        sql`${trafficLog.shareToken} IS NOT NULL`,
      ),
    )
    .groupBy(trafficLog.shareToken)
    .orderBy(desc(sql`sum(${trafficLog.bytes})`))
    .limit(10);

  const tokens = topSharesRows
    .map((r) => r.token)
    .filter((t): t is string => !!t);
  const shareMeta =
    tokens.length > 0
      ? await db
          .select({
            token: shareLinks.token,
            title: shareLinks.title,
            filePath: shareLinks.filePath,
          })
          .from(shareLinks)
          .where(
            sql`${shareLinks.token} IN (${sql.join(
              tokens.map((t) => sql`${t}`),
              sql`, `,
            )})`,
          )
      : [];
  const shareMetaMap = new Map(
    shareMeta.map((s) => [s.token, { title: s.title, filePath: s.filePath }]),
  );

  // TOP 사용자 (선택 범위, user_id 있는 것만)
  const topUsersRows = await db
    .select({
      userId: trafficLog.userId,
      bytes: sql<number>`coalesce(sum(${trafficLog.bytes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(trafficLog)
    .where(
      and(
        gte(trafficLog.at, new Date(rangeFrom)),
        lte(trafficLog.at, new Date(rangeTo)),
        sql`${trafficLog.userId} IS NOT NULL`,
      ),
    )
    .groupBy(trafficLog.userId)
    .orderBy(desc(sql`sum(${trafficLog.bytes})`))
    .limit(10);

  const userIds = topUsersRows
    .map((r) => r.userId)
    .filter((u): u is string => !!u);
  const userMeta =
    userIds.length > 0
      ? await db
          .select({
            id: users.id,
            username: users.username,
            name: users.name,
            role: users.role,
          })
          .from(users)
          .where(
            sql`${users.id} IN (${sql.join(
              userIds.map((u) => sql`${u}`),
              sql`, `,
            )})`,
          )
      : [];
  const userMetaMap = new Map(userMeta.map((u) => [u.id, u]));

  // 활성 공유 링크 수
  const activeShares = await db
    .select({ n: sql<number>`count(*)` })
    .from(shareLinks);

  // 스토리지 정보 (옵션)
  const includeStorage = url.searchParams.get("includeStorage") !== "0";
  let storage: {
    usedBytes: number;
    fileCount: number;
    totalBytes: number | null;
    freeBytes: number | null;
  } | null = null;
  if (includeStorage) {
    try {
      const root = getStorageRoot();
      const [usage, disk] = await Promise.all([
        measureStorage(root),
        diskFree(root),
      ]);
      storage = {
        usedBytes: usage.bytes,
        fileCount: usage.files,
        totalBytes: disk?.totalBytes ?? null,
        freeBytes: disk?.freeBytes ?? null,
      };
    } catch {
      storage = null;
    }
  }

  return NextResponse.json({
    range: { from: rangeFrom, to: rangeTo },
    total: {
      bytes: Number(totalRows[0]?.bytes ?? 0),
      count: Number(totalRows[0]?.count ?? 0),
    },
    today: {
      bytes: Number(todayRows[0]?.bytes ?? 0),
      count: Number(todayRows[0]?.count ?? 0),
    },
    last7: {
      bytes: Number(last7Rows[0]?.bytes ?? 0),
      count: Number(last7Rows[0]?.count ?? 0),
    },
    last30: {
      bytes: Number(last30Rows[0]?.bytes ?? 0),
      count: Number(last30Rows[0]?.count ?? 0),
    },
    thisMonth: {
      bytes: Number(thisMonthRows[0]?.bytes ?? 0),
      count: Number(thisMonthRows[0]?.count ?? 0),
    },
    rangeTotal: {
      bytes: Number(rangeTotalRows[0]?.bytes ?? 0),
      count: Number(rangeTotalRows[0]?.count ?? 0),
    },
    liveBytesPerSec,
    bySource: bySourceRows.map((r) => ({
      source: r.source,
      bytes: Number(r.bytes),
      count: Number(r.count),
    })),
    daily,
    topFiles: topFilesRows.map((r) => ({
      path: r.path,
      bytes: Number(r.bytes),
      count: Number(r.count),
    })),
    topShares: topSharesRows.map((r) => {
      const meta = r.token ? shareMetaMap.get(r.token) : null;
      return {
        token: r.token,
        title: meta?.title ?? null,
        filePath: meta?.filePath ?? null,
        bytes: Number(r.bytes),
        count: Number(r.count),
      };
    }),
    topUsers: topUsersRows.map((r) => {
      const meta = r.userId ? userMetaMap.get(r.userId) : null;
      return {
        userId: r.userId,
        username: meta?.username ?? null,
        name: meta?.name ?? null,
        role: meta?.role ?? null,
        bytes: Number(r.bytes),
        count: Number(r.count),
      };
    }),
    activeShares: Number(activeShares[0]?.n ?? 0),
    storage,
  });
}
