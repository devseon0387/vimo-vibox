/**
 * vinote — note_index / note_fts / note_versions 운영 헬퍼.
 * 파일(Notes/*.md)이 truth. 이 파일은 그 truth를 DB로 끌어와 검색·이력 가능하게 함.
 *
 * lib/notes.ts (기존 파일 I/O)는 손대지 않음. 이 파일은 그 위에서 보조 역할.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { sql, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteIndex, noteVersions } from "@/lib/db/schema";
import { getZoneRoot } from "@/lib/fs/storage";

/** Notes zone 루트 (rendering 부모 디렉터리의 sibling) */
function notesRoot(): string {
  return getZoneRoot("notes");
}

/** 노트 path 정규화: '/notes/일기/file.md' ← absolute path */
export function notePathFromAbs(abs: string): string | null {
  const root = notesRoot();
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return "/notes/" + rel.split(path.sep).join("/");
}

export function absFromNotePath(notePath: string): string | null {
  if (!notePath.startsWith("/notes/")) return null;
  const rel = notePath.slice("/notes/".length);
  return path.join(notesRoot(), rel);
}

/** 본문에서 발췌 200자 (frontmatter 제외) */
function extractExcerpt(body: string): string {
  return body.replace(/\n+/g, " ").trim().slice(0, 200);
}

function countWords(body: string): number {
  // 한국어/영어 혼용 — 공백 기반 + 한글 음절 1개도 1단어
  const ascii = body.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  const cjk = body.match(/[ㄱ-ㆎ가-힣]/g)?.length ?? 0;
  return ascii + Math.ceil(cjk / 2);
}

/** 단일 노트 인덱싱: 파일 읽고 note_index + note_fts 갱신. */
export async function reindexNote(notePath: string): Promise<{ ok: true; mtimeMs: number } | { ok: false; error: string }> {
  const abs = absFromNotePath(notePath);
  if (!abs) return { ok: false, error: "invalid note path" };

  let raw: string;
  let stat: import("node:fs").Stats;
  try {
    raw = await fs.readFile(abs, "utf-8");
    stat = await fs.stat(abs);
  } catch (e) {
    // 파일 없으면 인덱스에서도 제거
    await db.delete(noteIndex).where(eq(noteIndex.path, notePath));
    await db.run(sql`DELETE FROM note_fts WHERE path = ${notePath}`);
    return { ok: false, error: e instanceof Error ? e.message : "read failed" };
  }

  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  const title = (fm.title as string | undefined) ?? path.basename(abs, ".md");
  const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
  const starred = Boolean(fm.starred);
  const folderRel = path.dirname(notePath.slice("/notes/".length));
  const folder = folderRel === "." ? "/" : "/" + folderRel;
  const excerpt = extractExcerpt(parsed.content);
  const wordCount = countWords(parsed.content);
  const modifiedAt = Math.floor(stat.mtimeMs);
  const indexedAt = Date.now();

  // note_index upsert
  await db
    .insert(noteIndex)
    .values({
      path: notePath,
      title,
      excerpt,
      tags: JSON.stringify(tags),
      folder,
      wordCount,
      modifiedAt,
      indexedAt,
      starred,
    })
    .onConflictDoUpdate({
      target: noteIndex.path,
      set: {
        title,
        excerpt,
        tags: JSON.stringify(tags),
        folder,
        wordCount,
        modifiedAt,
        indexedAt,
        starred,
      },
    });

  // note_fts upsert — content='' (external content) 이므로 직접 INSERT/DELETE
  await db.run(sql`DELETE FROM note_fts WHERE path = ${notePath}`);
  await db.run(
    sql`INSERT INTO note_fts (path, title, body) VALUES (${notePath}, ${title}, ${parsed.content})`,
  );

  return { ok: true, mtimeMs: modifiedAt };
}

/** Notes/ 전체 풀스캔 → 인덱싱. admin이 명시 호출 또는 cron 1시간. */
export async function reindexAll(): Promise<{ indexed: number; failed: number }> {
  const root = notesRoot();
  const indexed: string[] = [];
  const failed: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile() && e.name.endsWith(".md")) {
        const np = notePathFromAbs(abs);
        if (!np) continue;
        const r = await reindexNote(np);
        if (r.ok) indexed.push(np);
        else failed.push(np);
      }
    }
  }
  await walk(root);

  // 인덱스에 있는데 파일이 없는 것 정리 (외부 삭제 흡수)
  const liveSet = new Set(indexed);
  const all = await db.select({ path: noteIndex.path }).from(noteIndex);
  const orphan = all.filter((r) => !liveSet.has(r.path)).map((r) => r.path);
  for (const p of orphan) {
    await db.delete(noteIndex).where(eq(noteIndex.path, p));
    await db.run(sql`DELETE FROM note_fts WHERE path = ${p}`);
  }

  return { indexed: indexed.length, failed: failed.length };
}

/** 버전 기록 — 호출자가 조건 판단 (디바운스/임계) */
export async function recordVersion(opts: {
  path: string;
  body: string;
  savedBy: string | null;
  reason: "autosave" | "manual" | "conflict" | "restore";
}): Promise<void> {
  await db.insert(noteVersions).values({
    id: randomUUID(),
    path: opts.path,
    body: opts.body,
    savedAt: Date.now(),
    savedBy: opts.savedBy,
    reason: opts.reason,
    bytes: Buffer.byteLength(opts.body, "utf-8"),
  });

  // Thinning: 최근 50개 유지. 그 위는 별도 cron에서 7/30/90일 단위로 압축.
  const old = await db
    .select({ id: noteVersions.id, savedAt: noteVersions.savedAt })
    .from(noteVersions)
    .where(eq(noteVersions.path, opts.path))
    .orderBy(desc(noteVersions.savedAt));
  if (old.length > 50) {
    const idsToDelete = old.slice(50).map((r) => r.id);
    for (const id of idsToDelete) {
      await db.delete(noteVersions).where(eq(noteVersions.id, id));
    }
  }
}

/** 마지막 버전 기록 시각 (디바운스 임계 계산용) */
export async function lastVersionAt(notePath: string): Promise<number | null> {
  const [row] = await db
    .select({ savedAt: noteVersions.savedAt })
    .from(noteVersions)
    .where(eq(noteVersions.path, notePath))
    .orderBy(desc(noteVersions.savedAt))
    .limit(1);
  return row?.savedAt ?? null;
}
