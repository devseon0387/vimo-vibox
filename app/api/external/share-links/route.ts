/**
 * POST /api/external/share-links
 *
 * 외부 ERP(비모 ERP)에서 회차 단위 공유 링크 생성.
 *
 * 인증: vimo_session 쿠키 (SSO 핸드오프로 받음) — 매니저 본인이 created_by로 기록됨
 *
 * Body:
 *   {
 *     episodeId?: string;       // 회차 ID — fileUploads에서 paths 자동 수집
 *     paths?: string[];         // 또는 직접 path 배열 지정
 *     title?: string;           // 표시명 (선택)
 *     allowComments?: boolean;  // 기본 true
 *     allowDownload?: boolean;  // 기본 true
 *     mode?: "preview" | "full"; // 기본 "full"
 *   }
 *
 * 응답: { token, url, paths }
 */
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { fileUploads, shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "invalid body" }, { status: 400, headers: cors });
  }

  const {
    episodeId,
    paths: explicitPaths,
    title,
    allowComments = true,
    allowDownload = true,
    mode = "full",
  } = body as {
    episodeId?: string;
    paths?: string[];
    title?: string;
    allowComments?: boolean;
    allowDownload?: boolean;
    mode?: "preview" | "full";
  };

  if (mode !== "preview" && mode !== "full") {
    return Response.json({ error: "invalid mode" }, { status: 400, headers: cors });
  }

  // paths 결정: explicitPaths 우선, 없으면 episodeId로 fileUploads 조회
  let paths: string[] = Array.isArray(explicitPaths) ? explicitPaths.filter((p) => typeof p === "string") : [];

  if (paths.length === 0 && typeof episodeId === "string" && episodeId) {
    const rows = await db
      .select({ path: fileUploads.path })
      .from(fileUploads)
      .where(eq(fileUploads.episodeId, episodeId));
    paths = rows.map((r) => r.path);
  }

  if (paths.length === 0) {
    return Response.json(
      { error: "no files found for share link" },
      { status: 404, headers: cors }
    );
  }

  const token = randomBytes(16).toString("hex");
  const id = randomBytes(8).toString("hex");

  await db.insert(shareLinks).values({
    id,
    token,
    filePath: paths[0], // backward compat
    paths: JSON.stringify(paths),
    title: title ?? null,
    mode,
    allowComments: !!allowComments,
    allowDownload: !!allowDownload,
    createdBy: session.sub,
    expiresAt: null,        // 만료 없음 (매니저가 수동 비활성화)
    passwordHash: null,     // 비밀번호 없음
    downloadCount: 0,
  });

  // 외부에서 접근할 vibox 공개 URL
  const publicBase = process.env.VIBOX_PUBLIC_URL ?? `${req.nextUrl.protocol}//${req.headers.get("host") ?? "localhost:4200"}`;
  const url = `${publicBase}/s/${token}`;

  return Response.json(
    { token, url, paths, mode, allowComments, allowDownload },
    { headers: cors }
  );
}

export const runtime = "nodejs";
