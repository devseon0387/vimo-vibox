import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { r2Cache } from "@/lib/db/schema";

// Cloudflare R2 = "가장 빠른 다운로드 경로" 레이어.
// 정본은 항상 M2 로컬 디스크. 외부 공유된 최신 영상만 R2에 두고(예산·TTL) 거기서 직접 서빙해
// 외부 클라가 CF 엣지(ICN)에서 받게 한다. 공유 링크 URL 은 vibox 토큰 그대로 유지 —
// 서버가 요청 시점에 R2(있으면)↔M2 를 투명 전환하므로 3일 뒤 축출돼도 링크는 안 바뀐다.

const ENDPOINT = process.env.R2_ENDPOINT ?? ""; // https://<acct>.r2.cloudflarestorage.com
const BUCKET = process.env.R2_BUCKET ?? "";
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const REGION = "auto";
const SERVICE = "s3";

export function r2Enabled(): boolean {
  return Boolean(ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY);
}

export function r2Bucket(): string {
  return BUCKET;
}

/** storage 경로(/a/b.mp4) → R2 object key (a/b.mp4) */
export function r2KeyFor(path: string): string {
  return path.replace(/^\/+/, "");
}

// ───── SigV4 presigned GET (쿼리 서명, node:crypto 만 사용 — 외부 SDK 불요) ─────
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
function encodeKeyPath(key: string): string {
  // 경로 세그먼트는 인코딩하되 '/' 는 보존 (S3 canonical URI 규칙).
  return key.split("/").map(rfc3986).join("/");
}
function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * R2 객체에 대한 시한부 presigned GET URL (기본 30분).
 * downloadName 주면 Content-Disposition=attachment 로 원본 파일명 보존.
 * 공유 토큰 검증을 통과한 뒤에만 호출되므로(=접근 통제는 토큰), URL 은 짧게.
 */
export function presignGet(
  key: string,
  opts: { expiresSec?: number; downloadName?: string } = {},
): string {
  if (!r2Enabled()) throw new Error("R2 not configured");
  const expires = Math.min(Math.max(opts.expiresSec ?? 1800, 1), 604800);
  const host = new URL(ENDPOINT).host;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${rfc3986(BUCKET)}/${encodeKeyPath(key)}`;

  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  if (opts.downloadName) {
    params["response-content-disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`;
  }
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + SECRET_KEY, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `${ENDPOINT}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * 이 경로가 현재 R2 에 올라가 있나? 있으면 {key, bytes}, 없으면 null(→ 호출부가 M2 폴백).
 * 정본은 항상 M2 라 DB 오류 시에도 안전하게 null 반환.
 */
export async function getCachedR2(
  path: string,
): Promise<{ key: string; bytes: number } | null> {
  if (!r2Enabled()) return null;
  try {
    const rows = await db
      .select()
      .from(r2Cache)
      .where(eq(r2Cache.path, path))
      .limit(1);
    const r = rows[0];
    return r ? { key: r.r2Key, bytes: Number(r.bytes) } : null;
  } catch {
    return null;
  }
}
