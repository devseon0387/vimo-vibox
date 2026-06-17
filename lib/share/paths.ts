import path from "node:path";
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

/**
 * 받는 사람이 요청한 경로가 이 공유 링크에서 접근 허용되는지 (보안 경계).
 * - folder 공유: 공유 폴더(link.filePath) 자기 자신 또는 그 하위 경로만 허용.
 *   normalize 로 `..` 정규화 후 prefix 검사 → 공유 폴더 밖 탈출 차단.
 *   (호출부에서 resolveSafePath 로 zone 경계까지 이중 검증)
 * - file 공유: 정적 paths 목록에 정확히 포함돼야.
 */
export function isPathInShare(link: ShareLink, requestedPath: string): boolean {
  // 경로 비교는 유니코드 정규화(NFC) 후 수행. macOS 파일명은 NFD 인데 일부 저장 경로는
  // NFC(예: comments.filePath 는 POST 시 NFC 정규화)라, 정규화 없이 비교하면 한글 파일명에서
  // 동일 파일인데도 불일치(거짓 거부)가 난다. 양쪽을 NFC 로 맞추면 동치 경로만 같아져 경계가
  // 약해지지 않는다.
  const req = requestedPath.normalize("NFC");
  if (link.kind === "folder") {
    const root = link.filePath.replace(/\/+$/, "").normalize("NFC");
    const norm = path.posix.normalize(req.startsWith("/") ? req : "/" + req);
    return norm === root || norm.startsWith(root + "/");
  }
  return resolveAllowedPaths(link).some((p) => p.normalize("NFC") === req);
}

/** folder 공유의 루트 경로 (trailing slash 제거). file 공유면 null. */
export function shareFolderRoot(link: ShareLink): string | null {
  if (link.kind !== "folder") return null;
  return link.filePath.replace(/\/+$/, "") || "/";
}
