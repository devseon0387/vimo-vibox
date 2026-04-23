import type { ShareLink } from "@/lib/db/schema";

/**
 * 공유 링크의 paths 필드를 안전하게 파싱.
 * - null/빈 문자열이면 link.filePath 단일 항목으로 폴백
 * - invalid JSON 이면 filePath 폴백 (500 에러 방지)
 * - JSON.parse 결과가 string 배열 아니면 필터링
 */
export function resolveAllowedPaths(link: ShareLink): string[] {
  if (!link.paths) return [link.filePath];
  try {
    const parsed = JSON.parse(link.paths);
    if (!Array.isArray(parsed)) return [link.filePath];
    const strings = parsed.filter((v): v is string => typeof v === "string");
    return strings.length > 0 ? strings : [link.filePath];
  } catch {
    return [link.filePath];
  }
}
