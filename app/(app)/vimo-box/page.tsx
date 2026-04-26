import { notFound } from "next/navigation";
import path from "node:path";
import fs from "node:fs/promises";
import { resolveSafePath, type FileEntry } from "@/lib/fs/storage";
import { getCurrentSession } from "@/lib/auth/session";
import { FeedbackModal } from "@/components/FeedbackModal";

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

  return (
    <FeedbackModal
      entry={entry}
      backHref={backHref}
      currentUserId={session.sub}
      isAdmin={session.role === "admin"}
      role={session.role}
      initialSeekMs={Number.isFinite(initialSeekMs) ? initialSeekMs : undefined}
    />
  );
}
