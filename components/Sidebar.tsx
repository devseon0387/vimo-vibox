import { getCurrentSession } from "@/lib/auth/session";
import { SegmentSidebar } from "./SegmentSidebar";

/**
 * 사이드바 = 단일 컬럼(232px) 세그먼트 사이드바.
 * 세그먼트 컨트롤(홈/My box/비모/활동) + 공간별 컬러 CTA + 활성 공간 섹션 + 유저/관리 푸터.
 * (이전: Rail 84px + 컨텍스트 메뉴 240px = 324px 2단 → 단일 232px로 합침)
 */
export async function Sidebar() {
  const session = await getCurrentSession();
  const isAdmin = session?.role === "admin";
  const isPartner = session?.role === "partner";
  const name = session?.name ?? session?.username ?? "사용자";
  const subtitle = session?.username ?? (isAdmin ? "관리자" : "팀원");
  const initials = (session?.name ?? session?.username ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SegmentSidebar
      isAdmin={isAdmin}
      isPartner={isPartner}
      initials={initials}
      name={name}
      subtitle={subtitle}
    />
  );
}
