import { notFound } from "next/navigation";
import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  listDirectory,
  resolveSafePath,
  type FileEntry,
} from "@/lib/fs/storage";
import { getCurrentSession } from "@/lib/auth/session";
import { FeedbackModal } from "@/components/FeedbackModal";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function detectKind(name: string): FileEntry["kind"] {
  const ext = path.extname(name).toLowerCase().slice(1);
  if (["mp4", "mov", "mkv", "avi", "webm", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp"].includes(ext))
    return "image";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  return "other";
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const filePath = sp.path;
  const initialSeekMs = sp.t ? Number(sp.t) : undefined;
  if (!filePath) notFound();

  let abs: string;
  try {
    abs = resolveSafePath(filePath);
  } catch {
    notFound();
  }

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    notFound();
  }

  if (stat.isDirectory()) notFound();

  const name = path.basename(abs);
  const entry: FileEntry = {
    name,
    path: filePath,
    isFolder: false,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    kind: detectKind(name),
  };

  const session = await getCurrentSession();
  if (!session) notFound();

  const parentPath = path.posix.dirname(filePath);
  const backHref =
    parentPath === "/" ? "/" : `/?path=${encodeURIComponent(parentPath)}`;

  // 형제 영상 prev/next — J/K 키 단축키 네비용
  let prevHref: string | undefined;
  let nextHref: string | undefined;
  try {
    const siblings = await listDirectory(parentPath);
    const videos = siblings
      .filter((e) => !e.isFolder && e.kind === "video")
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const idx = videos.findIndex((v) => v.path === filePath);
    if (idx > 0) {
      prevHref = `/vimo-box?path=${encodeURIComponent(videos[idx - 1].path)}`;
    }
    if (idx >= 0 && idx < videos.length - 1) {
      nextHref = `/vimo-box?path=${encodeURIComponent(videos[idx + 1].path)}`;
    }
  } catch {
    // 형제 못 가져와도 페이지 자체는 동작
  }

  // 업로더 이름 (헤더 표시용)
  const [uploadRow] = await db
    .select({ name: fileUploads.uploadedByName })
    .from(fileUploads)
    .where(eq(fileUploads.path, filePath))
    .limit(1);
  const uploaderName = uploadRow?.name ?? null;

  return (
    <FeedbackModal
      entry={entry}
      backHref={backHref}
      prevHref={prevHref}
      nextHref={nextHref}
      uploaderName={uploaderName}
      currentUserId={session.sub}
      isAdmin={session.role === "admin"}
      role={session.role}
      initialSeekMs={Number.isFinite(initialSeekMs) ? initialSeekMs : undefined}
    />
  );
}
