/**
 * Rail navigation key 추출 — URL 기반.
 * 5개 항목: 홈(/) · My box(/my) · 비모(/team) · 활동(/inbox·/insights·/activity) · 관리(/admin·/shares·/trash·/dev)
 *
 * "개발(/dev/notes)"은 admin 메뉴 안으로 흡수 — Rail에서 제거.
 */
export type RailKey = "home" | "mybox" | "team" | "activity" | "admin";

export function railFromPath(pathname: string): RailKey {
  if (pathname.startsWith("/my")) return "mybox";
  if (pathname.startsWith("/team")) return "team";
  if (
    pathname.startsWith("/inbox") ||
    pathname.startsWith("/insights") ||
    pathname.startsWith("/activity")
  ) {
    return "activity";
  }
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dev") ||
    pathname === "/shares" ||
    pathname.startsWith("/shares/") ||
    pathname === "/trash" ||
    pathname.startsWith("/trash/")
  ) {
    return "admin";
  }
  // /, /vimo-box, /s, etc → home(=대시보드)
  return "home";
}

export function railIsAdminOnly(key: RailKey): boolean {
  return key === "admin";
}
