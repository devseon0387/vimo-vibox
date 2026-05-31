import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { isPathInShare, shareFolderRoot } from "@/lib/share/paths";
import { listDirectory } from "@/lib/fs/storage";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/s/[token]/list?path=<하위폴더>
 * 폴더 공유의 디렉터리 목록 (공개 — 토큰만 있으면). 공유 폴더 하위 경계 강제.
 * path 미지정 시 공유 폴더 루트.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  // 토큰 brute force / 디렉터리 walk 남용 방지
  const ip = getClientIp(req);
  const rl = rateLimit(`share-list:${ip}`, { max: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  if (!link) return Response.json({ error: "not found" }, { status: 404 });
  if (link.revokedAt) return Response.json({ error: "revoked" }, { status: 410 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "expired" }, { status: 410 });
  }
  if (link.kind !== "folder") {
    return Response.json({ error: "not a folder share" }, { status: 400 });
  }

  const root = shareFolderRoot(link);
  if (!root) return Response.json({ error: "invalid share" }, { status: 400 });

  const reqPath = req.nextUrl.searchParams.get("path") || root;
  // 보안 경계: 요청 경로가 공유 폴더 자기 자신 또는 하위인지
  if (!isPathInShare(link, reqPath)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let entries;
  try {
    entries = await listDirectory(reqPath); // 내부에서 resolveSafePath(zone 경계) 재검증
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({
    root,
    path: reqPath,
    entries: entries.map((e) => ({
      name: e.name,
      path: e.path,
      isFolder: e.isFolder,
      kind: e.kind,
      size: e.size,
      modifiedAt: e.modifiedAt,
    })),
  });
}
