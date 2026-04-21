import { notFound } from "next/navigation";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { SharePageClient } from "./share-client";

type Kind = "video" | "image" | "audio" | "pdf" | "other";

function detectKind(filename: string): Kind {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (["mp4", "mov", "mkv", "avi", "webm", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp"].includes(ext))
    return "image";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  if (!link) notFound();

  const expired = !!link.expiresAt && link.expiresAt.getTime() < Date.now();
  const needPassword = !!link.passwordHash;

  // paths 컬럼이 있으면 멀티, 없으면 단일
  const paths: string[] = link.paths
    ? (JSON.parse(link.paths) as string[])
    : [link.filePath];

  const files = paths.map((p) => ({
    path: p,
    name: path.basename(p),
    kind: detectKind(path.basename(p)),
  }));

  return (
    <SharePageClient
      token={token}
      title={link.title ?? files[0].name}
      files={files}
      expired={expired}
      needPassword={needPassword}
      expiresAt={link.expiresAt ? link.expiresAt.toISOString() : null}
      allowComments={link.allowComments}
      allowDownload={link.allowDownload}
    />
  );
}
