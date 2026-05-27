import type { Metadata } from "next";
import { notFound } from "next/navigation";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { resolveAllowedPaths } from "@/lib/share/paths";
import { SharePageClient } from "./share-client";

type Kind = "video" | "image" | "audio" | "pdf" | "other";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://vibox.cloud";

const VIDEO_EXT = /\.(mp4|mov|mkv|webm|m4v|avi)$/i;

// SNS (카톡·트위터·페북) 미리보기용 OG/Twitter 메타.
// 영상 썸네일을 /api/s/[token]/thumb 로 노출.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  if (!link || link.revokedAt) {
    return { title: "비박스" };
  }

  const paths = resolveAllowedPaths(link);
  const firstName = path.basename(paths[0]);
  const title = link.title ?? firstName;
  // 비번 걸린 링크는 OG 이미지 노출 안 함 (썸네일 보이면 비번 방어 무의미)
  const hasThumb = !link.passwordHash && paths.some((p) => VIDEO_EXT.test(p));
  const thumbUrl = hasThumb ? `${PUBLIC_BASE}/api/s/${token}/thumb` : undefined;
  const description =
    paths.length > 1 ? `${paths.length}개 파일 묶음` : "비박스 공유";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      url: `${PUBLIC_BASE}/s/${token}`,
      siteName: "비박스",
      ...(thumbUrl
        ? {
            images: [{ url: thumbUrl, alt: title }],
          }
        : {}),
    },
    twitter: {
      card: thumbUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(thumbUrl ? { images: [thumbUrl] } : {}),
    },
  };
}

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
  if (link.revokedAt) notFound();

  const expired = !!link.expiresAt && link.expiresAt.getTime() < Date.now();

  // paths 컬럼이 있으면 멀티, 없으면 단일 (invalid JSON 은 안전 폴백)
  const paths = resolveAllowedPaths(link);

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
      expiresAt={link.expiresAt ? link.expiresAt.toISOString() : null}
      allowComments={link.allowComments && link.mode === "full"}
      allowDownload={link.allowDownload}
      mode={link.mode}
    />
  );
}
