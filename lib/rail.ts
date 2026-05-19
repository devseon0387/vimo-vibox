/**
 * Rail navigation key 추출 — URL 기반.
 * 기존 라우팅 유지하면서 Rail 액티브 상태를 결정.
 */
export type RailKey = "home" | "dev" | "mybox" | "admin";

export function railFromPath(pathname: string): RailKey {
  if (pathname.startsWith("/dev")) return "dev";
  if (pathname.startsWith("/my")) return "mybox";
  if (
    pathname.startsWith("/admin") ||
    pathname === "/shares" ||
    pathname.startsWith("/shares/") ||
    pathname === "/trash" ||
    pathname.startsWith("/trash/")
  ) {
    return "admin";
  }
  // /, /vimo-box, /inbox, /insights, /s, etc → home
  return "home";
}

export function railIsAdminOnly(key: RailKey): boolean {
  return key === "dev" || key === "admin";
}
