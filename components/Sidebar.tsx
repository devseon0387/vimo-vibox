import { getCurrentSession } from "@/lib/auth/session";
import { Rail } from "./Rail";
import { MenuRouter } from "./menus/MenuRouter";

/**
 * 사이드바 = Rail (84px) + 컨텍스트 메뉴 (240px) = 324px.
 * Rail은 4개 항목 (홈/개발/내박스/관리) — 개발·관리는 admin 전용.
 * 메뉴는 Rail 선택에 따라 바뀜 (URL 기반).
 */
export async function Sidebar() {
  const session = await getCurrentSession();
  const isAdmin = session?.role === "admin";
  const initials = (session?.name ?? session?.username ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen">
      <Rail isAdmin={isAdmin} userInitials={initials} />
      <MenuRouter isAdmin={isAdmin} />
    </div>
  );
}
