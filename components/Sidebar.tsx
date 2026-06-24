import { getCurrentSession } from "@/lib/auth/session";
import { ManagerSidebar } from "./ManagerSidebar";
import { getPersonalSummary } from "@/lib/dashboard/queries";

/**
 * 매니저(admin/member) 사이드바 = 파트너와 통일된 새 디자인(ManagerSidebar):
 * 프로필 · 저장공간 · 홈/즐겨찾기/클라우드/라이브러리/관리 · vi.box 로고+버전(하단).
 * (이전: SegmentSidebar 세그먼트형 — 파트너 새 디자인과 불일치라 교체.)
 */
export async function Sidebar() {
  const session = await getCurrentSession();
  const isAdmin = session?.role === "admin";
  const name = session?.name ?? session?.username ?? "사용자";
  const subtitle = isAdmin ? "관리자" : "매니저";
  const initials = (session?.name ?? session?.username ?? "?")
    .slice(0, 2)
    .toUpperCase();
  const storage = session ? await getPersonalSummary(session.sub) : null;

  return (
    <ManagerSidebar
      isAdmin={isAdmin}
      initials={initials}
      userName={name}
      subtitle={subtitle}
      usedBytes={storage?.usedBytes ?? 0}
      quotaBytes={storage?.quotaBytes ?? 0}
    />
  );
}
