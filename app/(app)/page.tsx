import { getCurrentSession } from "@/lib/auth/session";
import { PartnerHome } from "@/components/PartnerHome";
import { NewCommentsCard } from "@/components/dashboard/NewCommentsCard";
import { ShareActivityCard } from "@/components/dashboard/ShareActivityCard";
import { InboxCard } from "@/components/dashboard/InboxCard";
import {
  getMyRecentFiles,
  getMyNewComments,
  getMyShareActivity,
  getInboxItems,
  getPersonalSummary,
} from "@/lib/dashboard/queries";

/**
 * 홈 = 업로더 중심 Dashboard. 파트너·매니저 모두 동일한 PartnerHome
 * (히어로 + 즐겨찾기 + 드라이브 리스트/그리드)을 사용 — 디자인 통일.
 * - partner(외부 편집자): 홈만 (오버사이트 없음).
 * - admin/member(매니저): 같은 홈 + 오버사이트(검수 코멘트·공유 활동·받은편지함)를 oversight 슬롯 맨 아래에.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const userName = session.name ?? session.username ?? "";

  // 파트너(외부 편집자) 전용 홈
  if (session.role === "partner") {
    const [partnerPersonal, partnerFiles] = await Promise.all([
      getPersonalSummary(session.sub),
      getMyRecentFiles(session.sub, 30),
    ]);
    return (
      <PartnerHome
        userName={userName}
        personalSummary={partnerPersonal}
        recentFiles={partnerFiles}
      />
    );
  }

  // 매니저(admin/member) 홈 — 병렬 페치
  const [personalData, recentFiles, newComments, shareActivity, inboxItems] =
    await Promise.all([
      getPersonalSummary(session.sub),
      getMyRecentFiles(session.sub, 30),
      getMyNewComments(session.sub, 5),
      getMyShareActivity(session.sub, 5),
      getInboxItems(session.sub, 6),
    ]);

  return (
    <PartnerHome
      userName={userName}
      personalSummary={personalData}
      recentFiles={recentFiles}
      teamLabel="비모 프로젝트"
      oversight={
        <>
          {/* 매니저 오버사이트 — 검수 코멘트 · 공유 활동 · 받은편지함 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NewCommentsCard comments={newComments} />
            <ShareActivityCard shares={shareActivity} />
          </div>
          <div className="mt-4">
            <InboxCard items={inboxItems} />
          </div>
        </>
      }
    />
  );
}
