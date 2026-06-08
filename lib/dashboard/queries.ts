import path from "node:path";
import fs from "node:fs/promises";
import { and, desc, eq, gte, inArray, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  fileUploads,
  comments,
  shareLinks,
  shareViews,
} from "@/lib/db/schema";
import { getZoneRoot } from "@/lib/fs/storage";

/** 파일 경로에서 공간 판별 — /personal/{userId}/...면 personal, 그 외 team */
export type FileSpace = "personal" | "team";
export function spaceOfPath(filePath: string, userId?: string): FileSpace {
  if (!filePath.startsWith("/")) filePath = "/" + filePath;
  if (filePath.startsWith("/personal/")) {
    // userId 지정 시 본인 영역만 personal 확인 (다른 사람 personal은 접근 불가지만 안전)
    if (userId) {
      const parts = filePath.split("/").filter(Boolean);
      return parts[1] === userId ? "personal" : "team";
    }
    return "personal";
  }
  return "team";
}

/** 내가 올린 최근 파일 — 메타(코멘트 수·조회 수 등) 포함 */
export type MyRecentFile = {
  path: string;
  filename: string;
  uploadedAt: number;
  space: FileSpace;
  commentCount: number;
  shareViewCount: number;
  hasShareLink: boolean;
  /** 매니저 코멘트가 달렸으나 새 버전 업로드 없으면 true */
  needsNewVersion: boolean;
  /** 최종 코멘트(어느 카테고리든)가 "approve" kind면 true */
  approved: boolean;
};

export async function getMyRecentFiles(userId: string, limit = 12): Promise<MyRecentFile[]> {
  const rows = await db
    .select({
      path: fileUploads.path,
      uploadedAt: fileUploads.uploadedAt,
    })
    .from(fileUploads)
    .where(eq(fileUploads.uploadedBy, userId))
    .orderBy(desc(fileUploads.uploadedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.path);

  // 코멘트 count
  const cmtRows = await db
    .select({
      filePath: comments.filePath,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(comments)
    .where(inArray(comments.filePath, paths))
    .groupBy(comments.filePath);
  const commentMap = new Map(cmtRows.map((r) => [r.filePath, Number(r.count)]));

  // 매니저(admin/member) 코멘트 존재 여부 + 최신 시각
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));
  const managerIds = managers.map((m) => m.id);
  const managerCmtRows = managerIds.length === 0
    ? []
    : await db
        .select({
          filePath: comments.filePath,
          kind: comments.kind,
          latestAt: sql<number>`max(${comments.createdAt})`.as("latestAt"),
        })
        .from(comments)
        .where(
          and(
            inArray(comments.filePath, paths),
            inArray(comments.authorId, managerIds),
          ),
        )
        .groupBy(comments.filePath, comments.kind);
  const latestManagerCmtMap = new Map<string, { latestAt: number; kinds: Set<string> }>();
  for (const r of managerCmtRows) {
    const cur = latestManagerCmtMap.get(r.filePath) ?? { latestAt: 0, kinds: new Set<string>() };
    if (Number(r.latestAt) > cur.latestAt) cur.latestAt = Number(r.latestAt);
    cur.kinds.add(r.kind);
    latestManagerCmtMap.set(r.filePath, cur);
  }

  // 공유 링크 / view count
  const slRows = await db
    .select({
      filePath: shareLinks.filePath,
      token: shareLinks.token,
    })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.createdBy, userId),
        isNull(shareLinks.revokedAt),
        inArray(shareLinks.filePath, paths),
      ),
    );
  const linkPaths = new Set(slRows.map((r) => r.filePath));
  const tokens = slRows.map((r) => r.token);
  let viewMap = new Map<string, number>();
  if (tokens.length > 0) {
    const viewRows = await db
      .select({
        token: shareViews.shareToken,
        filePath: shareViews.filePath,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(shareViews)
      .where(inArray(shareViews.shareToken, tokens))
      .groupBy(shareViews.shareToken, shareViews.filePath);
    for (const v of viewRows) {
      const key = v.filePath;
      viewMap.set(key, (viewMap.get(key) ?? 0) + Number(v.count));
    }
  }

  return rows.map((r) => {
    const managerCmt = latestManagerCmtMap.get(r.path);
    // "approve" kind 있으면 승인. 매니저 코멘트가 있는데 업로드 시각이 그보다 빠르면 새 버전 필요.
    const approved = managerCmt?.kinds.has("approve") ?? false;
    const needsNewVersion = !!managerCmt && r.uploadedAt.getTime() < managerCmt.latestAt && !approved;
    return {
      path: r.path,
      filename: r.path.split("/").pop() ?? r.path,
      uploadedAt: r.uploadedAt.getTime(),
      space: spaceOfPath(r.path, userId),
      commentCount: commentMap.get(r.path) ?? 0,
      shareViewCount: viewMap.get(r.path) ?? 0,
      hasShareLink: linkPaths.has(r.path),
      needsNewVersion,
      approved,
    };
  });
}

/** 파트너 비모(team) 납품 전체 검수 현황 요약 — 최근 N건이 아닌 전 기간 집계.
 *  PartnerHome 검수 현황 게이지가 정확한 총계를 보이도록 별도 계산(getMyRecentFiles 와 같은 status 로직). */
export type DeliverySummary = {
  total: number;
  review: number;
  revise: number;
  approve: number;
};

export async function getPartnerDeliverySummary(userId: string): Promise<DeliverySummary> {
  const rows = await db
    .select({ path: fileUploads.path, uploadedAt: fileUploads.uploadedAt })
    .from(fileUploads)
    .where(eq(fileUploads.uploadedBy, userId));
  // 비모(team) 공간만 — 개인 보관함 제외
  const team = rows.filter((r) => spaceOfPath(r.path, userId) === "team");
  if (team.length === 0) return { total: 0, review: 0, revise: 0, approve: 0 };

  const paths = team.map((r) => r.path);
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));
  const managerIds = managers.map((m) => m.id);
  const managerCmtRows = managerIds.length === 0
    ? []
    : await db
        .select({
          filePath: comments.filePath,
          kind: comments.kind,
          latestAt: sql<number>`max(${comments.createdAt})`.as("latestAt"),
        })
        .from(comments)
        .where(and(inArray(comments.filePath, paths), inArray(comments.authorId, managerIds)))
        .groupBy(comments.filePath, comments.kind);
  const cmtMap = new Map<string, { latestAt: number; kinds: Set<string> }>();
  for (const r of managerCmtRows) {
    const cur = cmtMap.get(r.filePath) ?? { latestAt: 0, kinds: new Set<string>() };
    if (Number(r.latestAt) > cur.latestAt) cur.latestAt = Number(r.latestAt);
    cur.kinds.add(r.kind);
    cmtMap.set(r.filePath, cur);
  }

  let review = 0, revise = 0, approve = 0;
  for (const r of team) {
    const c = cmtMap.get(r.path);
    const approved = c?.kinds.has("approve") ?? false;
    const needsNew = !!c && r.uploadedAt.getTime() < c.latestAt && !approved;
    if (approved) approve++;
    else if (needsNew) revise++;
    else review++;
  }
  return { total: team.length, review, revise, approve };
}

/** 내가 올린 파일에 달린 최근 코멘트 (24시간 이내) */
export type MyNewComment = {
  id: string;
  filePath: string;
  filename: string;
  body: string;
  authorName: string;
  createdAt: number;
  space: FileSpace;
};

export async function getMyNewComments(userId: string, limit = 5): Promise<MyNewComment[]> {
  const since = new Date(Date.now() - 86400_000);
  const rows = await db
    .select({
      id: comments.id,
      filePath: comments.filePath,
      body: comments.body,
      authorName: comments.authorName,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(fileUploads, eq(comments.filePath, fileUploads.path))
    .where(and(eq(fileUploads.uploadedBy, userId), gte(comments.createdAt, since)))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    filePath: r.filePath,
    filename: r.filePath.split("/").pop() ?? r.filePath,
    body: r.body,
    authorName: r.authorName,
    createdAt: r.createdAt.getTime(),
    space: spaceOfPath(r.filePath, userId),
  }));
}

/** 내 공유 링크 + 조회 통계 */
export type MyShareActivity = {
  token: string;
  filePath: string;
  filename: string;
  title: string | null;
  totalViews: number;
  lastViewedAt: number | null;
  space: FileSpace;
};

export async function getMyShareActivity(userId: string, limit = 5): Promise<MyShareActivity[]> {
  const slRows = await db
    .select({
      token: shareLinks.token,
      filePath: shareLinks.filePath,
      title: shareLinks.title,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(and(eq(shareLinks.createdBy, userId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt))
    .limit(20);

  if (slRows.length === 0) return [];
  const tokens = slRows.map((r) => r.token);
  const viewRows = await db
    .select({
      token: shareViews.shareToken,
      count: sql<number>`count(*)`.as("count"),
      latestAt: sql<number>`max(${shareViews.openedAt})`.as("latestAt"),
    })
    .from(shareViews)
    .where(inArray(shareViews.shareToken, tokens))
    .groupBy(shareViews.shareToken);
  const viewMap = new Map(viewRows.map((v) => [v.token, { count: Number(v.count), latestAt: Number(v.latestAt) }]));

  return slRows
    .map((r) => {
      const v = viewMap.get(r.token);
      return {
        token: r.token,
        filePath: r.filePath,
        filename: r.filePath.split("/").pop() ?? r.filePath,
        title: r.title,
        totalViews: v?.count ?? 0,
        lastViewedAt: v?.latestAt ?? null,
        space: spaceOfPath(r.filePath, userId),
      };
    })
    .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
    .slice(0, limit);
}

/** 받은편지함 — 매니저(admin/member)가 검수 대기인 최근 14일 업로드 */
export type InboxItem = {
  path: string;
  filename: string;
  uploadedByName: string;
  uploadedAt: number;
};

export async function getInboxItems(currentUserId: string, limit = 5): Promise<InboxItem[]> {
  const since = new Date(Date.now() - 14 * 86400_000);
  const recent = await db
    .select({
      path: fileUploads.path,
      uploadedByName: fileUploads.uploadedByName,
      uploadedAt: fileUploads.uploadedAt,
    })
    .from(fileUploads)
    .where(gte(fileUploads.uploadedAt, since))
    .orderBy(desc(fileUploads.uploadedAt))
    .limit(50);

  if (recent.length === 0) return [];
  const paths = recent.map((r) => r.path);

  // 매니저(admin/member) 코멘트가 이미 달린 파일은 검수 완료로 간주
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));
  const managerIds = managers.map((m) => m.id);

  const reviewed = managerIds.length === 0
    ? []
    : await db
        .selectDistinct({ filePath: comments.filePath })
        .from(comments)
        .where(
          and(
            inArray(comments.filePath, paths),
            inArray(comments.authorId, managerIds),
          ),
        );
  const reviewedSet = new Set(reviewed.map((r) => r.filePath));

  return recent
    .filter((r) => !reviewedSet.has(r.path))
    .slice(0, limit)
    .map((r) => ({
      path: r.path,
      filename: r.path.split("/").pop() ?? r.path,
      uploadedByName: r.uploadedByName,
      uploadedAt: r.uploadedAt.getTime(),
    }));
}

/** Personal 공간 사용량 — 디스크 스캔 */
export type PersonalSummary = {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  lastUploadAt: number | null;
};

export async function getPersonalSummary(userId: string): Promise<PersonalSummary> {
  const [u] = await db
    .select({ quotaGb: users.quotaGb })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const quotaGb = u?.quotaGb ?? 100;
  const personalRoot = path.join(getZoneRoot("personal"), userId);

  let usedBytes = 0;
  let fileCount = 0;
  let lastUploadAt: number | null = null;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      try {
        if (e.isFile()) {
          const stat = await fs.stat(full);
          usedBytes += stat.size;
          fileCount += 1;
          if (lastUploadAt === null || stat.mtimeMs > lastUploadAt) lastUploadAt = stat.mtimeMs;
        } else if (e.isDirectory()) {
          await walk(full);
        }
      } catch {}
    }
  }
  await walk(personalRoot);
  return {
    usedBytes,
    quotaBytes: quotaGb * 1024 * 1024 * 1024,
    fileCount,
    lastUploadAt,
  };
}
