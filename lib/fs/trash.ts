import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { trashItems, shareLinks } from "@/lib/db/schema";
import {
  getStorageRoot,
  getZoneRoot,
  parseZoneFromPath,
  resolveSafePath,
} from "./storage";

function getTrashRoot(): string {
  return path.join(getStorageRoot(), ".vibox", "trash");
}

function getTrashItemPath(id: string): string {
  if (!/^[a-f0-9-]{30,}$/i.test(id)) throw new Error("invalid trash id");
  return path.join(getTrashRoot(), id);
}

export async function moveToTrash(
  relativePath: string,
  userId: string,
  userName: string,
): Promise<string> {
  const abs = resolveSafePath(relativePath);
  // 3개 zone 루트 모두 보호 (삭제 방지)
  for (const z of ["rendering", "library", "personal"] as const) {
    if (abs === getZoneRoot(z)) throw new Error(`Cannot trash ${z} root`);
  }

  const stat = await fs.stat(abs);
  const isFolder = stat.isDirectory();
  const name = path.basename(abs);
  const size = isFolder ? 0 : stat.size;

  const id = randomUUID();
  await fs.mkdir(getTrashRoot(), { recursive: true });
  const trashPath = getTrashItemPath(id);

  await fs.rename(abs, trashPath);

  await db.transaction(async (tx) => {
    await tx
      .delete(shareLinks)
      .where(eq(shareLinks.filePath, relativePath));

    await tx.insert(trashItems).values({
      id,
      originalPath: relativePath,
      name,
      isFolder,
      size,
      deletedBy: userId,
      deletedByName: userName,
    });
  });
  return id;
}

async function uniqueRestorePath(originalAbs: string): Promise<string> {
  try {
    await fs.access(originalAbs);
  } catch {
    return originalAbs;
  }
  const ext = path.extname(originalAbs);
  const base = ext ? originalAbs.slice(0, -ext.length) : originalAbs;
  for (let i = 1; i < 1000; i++) {
    const cand = `${base} (복원됨${i > 1 ? ` ${i}` : ""})${ext}`;
    try {
      await fs.access(cand);
    } catch {
      return cand;
    }
  }
  throw new Error("too many restore collisions");
}

export async function restoreFromTrash(trashId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(trashItems)
    .where(eq(trashItems.id, trashId))
    .limit(1);
  if (!row) throw new Error("not found");

  const trashPath = getTrashItemPath(row.id);
  const originalAbs = resolveSafePath(row.originalPath);
  await fs.mkdir(path.dirname(originalAbs), { recursive: true });

  const finalAbs = await uniqueRestorePath(originalAbs);
  await fs.rename(trashPath, finalAbs);

  await db.delete(trashItems).where(eq(trashItems.id, trashId));

  // 복원 경로를 zone-aware 상대 경로로 재구성
  const { zone } = parseZoneFromPath(row.originalPath);
  const zoneRoot = getZoneRoot(zone);
  const zoneRel = path.relative(zoneRoot, finalAbs).split(path.sep).join("/");
  const prefix = zone === "rendering" ? "" : `/${zone}`;
  return prefix + "/" + zoneRel;
}

export async function permanentDelete(trashId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(trashItems)
    .where(eq(trashItems.id, trashId))
    .limit(1);
  if (!row) return;
  const trashPath = getTrashItemPath(row.id);
  await fs.rm(trashPath, { recursive: true, force: true });
  await db.delete(trashItems).where(eq(trashItems.id, trashId));
}

export async function emptyAllTrash(): Promise<number> {
  const rows = await db.select({ id: trashItems.id }).from(trashItems);
  for (const r of rows) {
    await fs.rm(getTrashItemPath(r.id), { recursive: true, force: true });
  }
  await db.delete(trashItems);
  return rows.length;
}

export async function autoExpireOldTrash(daysOld = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: trashItems.id })
    .from(trashItems)
    .where(lt(trashItems.deletedAt, cutoff));
  for (const r of rows) {
    await fs.rm(getTrashItemPath(r.id), { recursive: true, force: true });
  }
  if (rows.length > 0) {
    await db.delete(trashItems).where(lt(trashItems.deletedAt, cutoff));
  }
  return rows.length;
}

export type TrashRow = {
  id: string;
  originalPath: string;
  name: string;
  isFolder: boolean;
  size: number;
  deletedBy: string;
  deletedByName: string;
  deletedAt: number;
};

export async function listTrash(): Promise<TrashRow[]> {
  const rows = await db.select().from(trashItems);
  return rows
    .map((r) => ({
      id: r.id,
      originalPath: r.originalPath,
      name: r.name,
      isFolder: Boolean(r.isFolder),
      size: r.size,
      deletedBy: r.deletedBy,
      deletedByName: r.deletedByName,
      deletedAt: r.deletedAt.getTime(),
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

