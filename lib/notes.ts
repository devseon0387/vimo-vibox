import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { getZoneRoot } from "@/lib/fs/storage";

function notesRoot(): string {
  return getZoneRoot("notes");
}

export type NoteFolder = {
  name: string;
  count: number;
};

export type NoteSummary = {
  id: string;
  folder: string;
  title: string;
  excerpt: string;
  tags: string[];
  starred: boolean;
  updated: number;
  size: number;
};

export type NoteDetail = NoteSummary & {
  content: string;
  path: string;
  raw: string;
};

export type FileTreeNode = {
  name: string;
  path: string;
  size: number;
  mtime: number;
};

export type FileTreeFolder = {
  name: string;
  path: string;
  files: FileTreeNode[];
};

function safeJoin(rel: string): string {
  const root = notesRoot();
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("path escape");
  }
  return resolved;
}

const FOLDER_NAME_RE = /^[^/\\:*?"<>|]+$/;

function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("폴더 이름을 입력해주세요");
  if (trimmed.length > 80) throw new Error("폴더 이름이 너무 깁니다 (최대 80자)");
  if (trimmed === "." || trimmed === "..") throw new Error("사용할 수 없는 이름입니다");
  if (!FOLDER_NAME_RE.test(trimmed)) {
    throw new Error("/ \\ : * ? \" < > | 는 사용할 수 없습니다");
  }
  return trimmed;
}

function fmExcerpt(body: string): string {
  const stripped = body
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/[*_`>#-]/g, "")
    .trim();
  return stripped.slice(0, 200);
}

function idFromRelative(folder: string, file: string): string {
  return `${folder}/${file.replace(/\.md$/, "")}`;
}

function parseRelative(id: string): { folder: string; file: string } {
  const idx = id.lastIndexOf("/");
  if (idx < 0) throw new Error("invalid id");
  return { folder: id.slice(0, idx), file: id.slice(idx + 1) + ".md" };
}

async function ensureRoot(): Promise<void> {
  const root = notesRoot();
  try {
    await fs.access(root);
  } catch {
    await fs.mkdir(root, { recursive: true });
  }
}

export async function listFolders(): Promise<NoteFolder[]> {
  await ensureRoot();
  const entries = await fs.readdir(notesRoot(), { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const out = await Promise.all(
    dirs.map(async (e) => {
      const sub = await fs.readdir(safeJoin(e.name));
      return { name: e.name, count: sub.filter((n) => n.endsWith(".md")).length };
    }),
  );
  out.sort((a, b) => {
    if (a.name === "_inbox") return -1;
    if (b.name === "_inbox") return 1;
    return a.name.localeCompare(b.name, "ko");
  });
  return out;
}

export async function listAllNotes(): Promise<NoteSummary[]> {
  await ensureRoot();
  const folders = await listFolders();
  // 폴더별 readdir + readSummary 모두 병렬
  const perFolder = await Promise.all(
    folders.map(async (f) => {
      const files = (await fs.readdir(safeJoin(f.name))).filter((n) => n.endsWith(".md"));
      const summaries = await Promise.all(files.map((file) => readSummary(f.name, file)));
      return summaries.filter((s): s is NoteSummary => s !== null);
    }),
  );
  const all = perFolder.flat();
  all.sort((a, b) => b.updated - a.updated);
  return all;
}

export async function listNotesInFolder(folder: string): Promise<NoteSummary[]> {
  await ensureRoot();
  const files = (await fs.readdir(safeJoin(folder))).filter((n) => n.endsWith(".md"));
  const summaries = await Promise.all(files.map((file) => readSummary(folder, file)));
  const out = summaries.filter((s): s is NoteSummary => s !== null);
  out.sort((a, b) => b.updated - a.updated);
  return out;
}

async function readSummary(folder: string, file: string): Promise<NoteSummary | null> {
  const abs = safeJoin(`${folder}/${file}`);
  try {
    const raw = await fs.readFile(abs, "utf-8");
    const stat = await fs.stat(abs);
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    const updatedRaw = (fm.updated as string | undefined) ?? null;
    const updated = updatedRaw ? Date.parse(updatedRaw) : stat.mtimeMs;
    const id = idFromRelative(folder, file);
    return {
      id,
      folder,
      title: (fm.title as string | undefined) ?? file.replace(/\.md$/, ""),
      excerpt: fmExcerpt(parsed.content),
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      starred: Boolean(fm.starred),
      updated: Number.isFinite(updated) ? updated : stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

export async function readNote(id: string): Promise<NoteDetail | null> {
  const { folder, file } = parseRelative(id);
  const summary = await readSummary(folder, file);
  if (!summary) return null;
  const raw = await fs.readFile(safeJoin(`${folder}/${file}`), "utf-8");
  const parsed = matter(raw);
  return {
    ...summary,
    content: parsed.content,
    raw,
    path: `Notes/${folder}/${file}`,
  };
}

export async function listFileTree(): Promise<FileTreeFolder[]> {
  await ensureRoot();
  const folders = await listFolders();
  const out = await Promise.all(
    folders.map(async (f) => {
      const dir = safeJoin(f.name);
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const fileEntries = dirents.filter((e) => e.isFile());
      const items = await Promise.all(
        fileEntries.map(async (e) => {
          const stat = await fs.stat(safeJoin(`${f.name}/${e.name}`));
          return {
            name: e.name,
            path: `Notes/${f.name}/${e.name}`,
            size: stat.size,
            mtime: stat.mtimeMs,
          };
        }),
      );
      items.sort((a, b) => b.mtime - a.mtime);
      return { name: f.name, path: `Notes/${f.name}`, files: items };
    }),
  );
  return out;
}

export type NoteHit = {
  id: string;
  folder: string;
  title: string;
  snippet: string;
  matchInTitle: boolean;
  updated: number;
};

export async function searchNotes(query: string, limit = 20): Promise<NoteHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  await ensureRoot();
  const folders = await listFolders();

  // 폴더별 + 파일별 모두 병렬
  const perFolder = await Promise.all(
    folders.map(async (f) => {
      let files: string[];
      try {
        files = (await fs.readdir(safeJoin(f.name))).filter((n) => n.endsWith(".md"));
      } catch {
        return [];
      }
      const hits = await Promise.all(
        files.map(async (file): Promise<NoteHit | null> => {
          const summary = await readSummary(f.name, file);
          if (!summary) return null;
          const titleMatch = summary.title.toLowerCase().includes(q);
          let bodySnippet = "";
          let bodyMatch = false;
          try {
            const raw = await fs.readFile(safeJoin(`${f.name}/${file}`), "utf-8");
            const parsed = matter(raw);
            const body = parsed.content;
            const lower = body.toLowerCase();
            const idx = lower.indexOf(q);
            if (idx >= 0) {
              bodyMatch = true;
              const start = Math.max(0, idx - 40);
              const end = Math.min(body.length, idx + q.length + 80);
              bodySnippet =
                (start > 0 ? "…" : "") +
                body.slice(start, end).trim() +
                (end < body.length ? "…" : "");
            }
          } catch {
            /* skip */
          }
          if (!titleMatch && !bodyMatch) return null;
          return {
            id: summary.id,
            folder: summary.folder,
            title: summary.title,
            snippet: bodySnippet || summary.excerpt,
            matchInTitle: titleMatch,
            updated: summary.updated,
          };
        }),
      );
      return hits.filter((h): h is NoteHit => h !== null);
    }),
  );
  const out = perFolder.flat();
  out.sort((a, b) => {
    if (a.matchInTitle !== b.matchInTitle) return a.matchInTitle ? -1 : 1;
    return b.updated - a.updated;
  });
  return out.slice(0, limit);
}

// ─── 첨부 (이미지 등) ──────────────────────────────────────────────────────
//
// 경로: Notes/_attachments/<folder>__<slug>/<filename>
// 노트와 1:N 관계. 노트 삭제·이동 시 첨부도 같이 처리는 별도 (TODO).

const ATTACHMENT_BASE = "_attachments";

function attachmentKey(noteId: string): string {
  // "folder/slug" → "folder__slug" (filesystem-safe flat ID)
  return noteId.replace(/\//g, "__");
}

const ALLOWED_ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif|pdf)$/i;
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB

export type SaveAttachmentInput = {
  noteId: string;        // "folder/slug"
  filename: string;      // "screenshot.png"
  bytes: ArrayBuffer | Buffer;
  mime?: string;
};

export type SaveAttachmentResult = {
  path: string;          // "Notes/_attachments/folder__slug/filename.png"
  url: string;           // "/api/notes/attachment/folder__slug/filename.png"
  size: number;
  mime: string;
};

export async function saveAttachment(
  input: SaveAttachmentInput,
): Promise<SaveAttachmentResult> {
  if (!input.noteId.includes("/")) {
    throw new Error("noteId 형식: folder/slug");
  }
  const safeFilename = path.basename(input.filename.trim());
  if (!safeFilename || safeFilename === "." || safeFilename === "..") {
    throw new Error("잘못된 파일명");
  }
  if (!FILE_NAME_RE.test(safeFilename)) {
    throw new Error("/ \\ : * ? \" < > | 는 사용할 수 없습니다");
  }
  if (!ALLOWED_ATTACHMENT_EXT.test(safeFilename)) {
    throw new Error("허용되지 않는 확장자 (png/jpg/gif/webp/svg/bmp/heic/avif/pdf만)");
  }
  const buf = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
  if (buf.byteLength > MAX_ATTACHMENT_SIZE) {
    throw new Error(`파일 크기 초과 (최대 ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB)`);
  }

  const key = attachmentKey(input.noteId);
  await ensureRoot();
  const dir = safeJoin(`${ATTACHMENT_BASE}/${key}`);
  await fs.mkdir(dir, { recursive: true });
  const abs = safeJoin(`${ATTACHMENT_BASE}/${key}/${safeFilename}`);
  await fs.writeFile(abs, buf);

  const ext = safeFilename.split(".").pop()?.toLowerCase() ?? "";
  const guessed: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp", heic: "image/heic", avif: "image/avif",
    pdf: "application/pdf",
  };
  return {
    path: `Notes/${ATTACHMENT_BASE}/${key}/${safeFilename}`,
    url: `/api/notes/attachment/${encodeURIComponent(key)}/${encodeURIComponent(safeFilename)}`,
    size: buf.byteLength,
    mime: input.mime ?? guessed[ext] ?? "application/octet-stream",
  };
}

export async function readAttachment(
  key: string,
  filename: string,
): Promise<{ bytes: Buffer; mime: string; size: number; mtime: number } | null> {
  const safeKey = path.basename(key);
  const safeFilename = path.basename(filename);
  if (!safeKey || !safeFilename) return null;
  const abs = safeJoin(`${ATTACHMENT_BASE}/${safeKey}/${safeFilename}`);
  try {
    const stat = await fs.stat(abs);
    const bytes = await fs.readFile(abs);
    const ext = safeFilename.split(".").pop()?.toLowerCase() ?? "";
    const guessed: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      bmp: "image/bmp", heic: "image/heic", avif: "image/avif",
      pdf: "application/pdf",
    };
    return {
      bytes,
      mime: guessed[ext] ?? "application/octet-stream",
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

export async function readRawFile(relPath: string): Promise<{ raw: string; size: number; mtime: number; path: string } | null> {
  const trimmed = relPath.replace(/^Notes\//i, "");
  const abs = safeJoin(trimmed);
  try {
    const raw = await fs.readFile(abs, "utf-8");
    const stat = await fs.stat(abs);
    return { raw, size: stat.size, mtime: stat.mtimeMs, path: `Notes/${trimmed}` };
  } catch {
    return null;
  }
}

export type WriteNoteInput = {
  folder: string;
  title: string;
  content: string;
  tags?: string[];
  starred?: boolean;
  slug?: string;            // 명시적 파일명 (확장자 제외). 없으면 title에서 생성
  overwrite?: boolean;      // 기존 파일 덮어쓰기. 기본 false → 충돌 시 -<n> suffix
};

export type WriteNoteResult = {
  id: string;
  path: string;             // "Notes/folder/slug.md"
  url: string;              // "/dev/notes?id=folder/slug"
  created: boolean;         // true=신규, false=덮어쓰기
};

const FILE_NAME_RE = /^[^/\\:*?"<>|]+$/;

function slugify(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildFrontmatter(input: WriteNoteInput): string {
  const fm: Record<string, unknown> = {
    title: input.title,
  };
  if (input.tags && input.tags.length > 0) fm.tags = input.tags;
  if (input.starred) fm.starred = true;
  fm.updated = new Date().toISOString();
  return matter.stringify("", fm).trim() + "\n";
}

export async function writeNote(input: WriteNoteInput): Promise<WriteNoteResult> {
  const folder = validateFolderName(input.folder);
  await ensureRoot();

  // 폴더가 없으면 자동 생성 (멱등)
  const folderAbs = safeJoin(folder);
  await fs.mkdir(folderAbs, { recursive: true });

  const baseSlug =
    input.slug?.trim() ||
    slugify(input.title) ||
    `note-${Date.now()}`;
  if (!FILE_NAME_RE.test(baseSlug)) {
    throw new Error(`잘못된 slug: ${baseSlug}`);
  }
  if (baseSlug === "." || baseSlug === "..") {
    throw new Error(`잘못된 slug: ${baseSlug}`);
  }

  const fm = buildFrontmatter(input);
  const body = input.content.trimStart();
  const full = `${fm}\n${body}`;

  // overwrite=true: 단순 truncate write (race 조건 무관)
  if (input.overwrite) {
    const absPath = safeJoin(`${folder}/${baseSlug}.md`);
    const exists = await fs.access(absPath).then(() => true).catch(() => false);
    await fs.writeFile(absPath, full, "utf-8");
    const id = `${folder}/${baseSlug}`;
    return {
      id,
      path: `Notes/${folder}/${baseSlug}.md`,
      url: `/dev/notes?id=${encodeURIComponent(id)}`,
      created: !exists,
    };
  }

  // overwrite=false: O_EXCL로 atomic create. EEXIST면 다음 suffix 시도.
  // TOCTOU race 회피 — 두 동시 호출이 같은 파일에 충돌하지 않음.
  for (let i = 1; i <= 50; i += 1) {
    const slug = i === 1 ? baseSlug : `${baseSlug}-${i}`;
    const absPath = safeJoin(`${folder}/${slug}.md`);
    let handle;
    try {
      handle = await fs.open(absPath, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
    try {
      await handle.writeFile(full, "utf-8");
    } finally {
      await handle.close();
    }
    const id = `${folder}/${slug}`;
    return {
      id,
      path: `Notes/${folder}/${slug}.md`,
      url: `/dev/notes?id=${encodeURIComponent(id)}`,
      created: true,
    };
  }
  throw new Error("파일명 충돌이 너무 많습니다 (50회 시도 실패)");
}

export type UpdateNoteInput = {
  id: string;                 // "folder/slug"
  title?: string;
  content?: string;
  tags?: string[];
  starred?: boolean;
  append?: boolean;           // true면 기존 content 끝에 이어붙임
};

export async function updateNote(input: UpdateNoteInput): Promise<NoteDetail> {
  const existing = await readNote(input.id);
  if (!existing) throw new Error("노트를 찾을 수 없습니다");

  const { folder, file } = parseRelative(input.id);
  const abs = safeJoin(`${folder}/${file}`);
  const raw = await fs.readFile(abs, "utf-8");
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  // frontmatter 머지
  if (input.title !== undefined) fm.title = input.title;
  if (input.tags !== undefined) fm.tags = input.tags;
  if (input.starred !== undefined) fm.starred = input.starred;
  fm.updated = new Date().toISOString();

  // content 머지
  let body = parsed.content;
  if (input.content !== undefined) {
    body = input.append
      ? body.trimEnd() + "\n\n" + input.content.trimStart()
      : input.content;
  }

  const full = matter.stringify(body, fm);
  await fs.writeFile(abs, full, "utf-8");

  const detail = await readNote(input.id);
  if (!detail) throw new Error("재조회 실패");
  return detail;
}

export async function deleteNote(id: string): Promise<void> {
  const { folder, file } = parseRelative(id);
  const abs = safeJoin(`${folder}/${file}`);
  try {
    await fs.unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("노트를 찾을 수 없습니다");
    }
    throw err;
  }
}

export type MoveNoteInput = {
  id: string;
  newFolder?: string;
  newSlug?: string;
};

export async function moveNote(
  input: MoveNoteInput,
): Promise<{ oldId: string; newId: string; path: string }> {
  const { folder, file } = parseRelative(input.id);
  const targetFolder = input.newFolder
    ? validateFolderName(input.newFolder)
    : folder;
  const baseSlug = input.newSlug?.trim() || file.replace(/\.md$/, "");
  if (!FILE_NAME_RE.test(baseSlug)) {
    throw new Error(`잘못된 slug: ${baseSlug}`);
  }
  const newId = `${targetFolder}/${baseSlug}`;
  if (newId === input.id) {
    return { oldId: input.id, newId, path: `Notes/${targetFolder}/${baseSlug}.md` };
  }
  const src = safeJoin(`${folder}/${file}`);
  const dst = safeJoin(`${targetFolder}/${baseSlug}.md`);
  await fs.mkdir(safeJoin(targetFolder), { recursive: true });
  try {
    await fs.access(dst);
    throw new Error("대상 경로에 이미 같은 이름이 있습니다");
  } catch (err) {
    if (err instanceof Error && err.message === "대상 경로에 이미 같은 이름이 있습니다") throw err;
  }
  await fs.rename(src, dst);
  return {
    oldId: input.id,
    newId,
    path: `Notes/${targetFolder}/${baseSlug}.md`,
  };
}

export async function createFolder(name: string): Promise<{ name: string }> {
  const validated = validateFolderName(name);
  await ensureRoot();
  const abs = safeJoin(validated);
  try {
    await fs.access(abs);
    throw new Error("이미 존재하는 폴더입니다");
  } catch (err) {
    if (err instanceof Error && err.message === "이미 존재하는 폴더입니다") throw err;
  }
  await fs.mkdir(abs, { recursive: false });
  return { name: validated };
}

export async function renameFolder(
  oldName: string,
  newName: string,
): Promise<{ oldName: string; newName: string }> {
  const oldValidated = validateFolderName(oldName);
  const newValidated = validateFolderName(newName);
  if (oldValidated === newValidated) {
    return { oldName: oldValidated, newName: newValidated };
  }
  await ensureRoot();
  const src = safeJoin(oldValidated);
  const dst = safeJoin(newValidated);

  try {
    await fs.access(src);
  } catch {
    throw new Error("원본 폴더가 없습니다");
  }
  // case-only rename은 같은 inode로 취급되므로 dst access 체크에서 통과시켜야 함
  const caseOnly = oldValidated.toLowerCase() === newValidated.toLowerCase();
  if (!caseOnly) {
    try {
      await fs.access(dst);
      throw new Error("대상 폴더가 이미 존재합니다");
    } catch (err) {
      if (err instanceof Error && err.message === "대상 폴더가 이미 존재합니다") throw err;
    }
  }
  if (caseOnly) {
    const tmp = safeJoin(`${oldValidated}.__rename_${Date.now()}`);
    await fs.rename(src, tmp);
    await fs.rename(tmp, dst);
  } else {
    await fs.rename(src, dst);
  }
  return { oldName: oldValidated, newName: newValidated };
}
