/**
 * 화면/URL 표시용 경로에서 zone prefix를 제거한다.
 * 내부 API는 항상 FULL 경로(/personal/{userId}/...)를 쓰지만,
 * 브레드크럼·폴더 열기 URL 등 사용자에게 보이는 곳에서는 prefix를 가린다.
 *
 * - displayPrefix 미지정(team/rendering zone) → 원본 그대로 반환 (no-op)
 * - p === prefix → "/" (루트)
 * - p가 prefix 하위 → prefix를 떼어낸 상대경로 (예: /personal/uid/foo → /foo)
 */
export function stripDisplayPrefix(p: string, prefix?: string): string {
  if (!prefix) return p;
  if (p === prefix) return "/";
  if (p.startsWith(prefix + "/")) return p.slice(prefix.length) || "/";
  return p;
}
