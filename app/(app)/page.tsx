import { getCurrentSession } from "@/lib/auth/session";
import { PartnerHome } from "@/components/PartnerHome";
import { ManagerHome } from "@/components/ManagerHome";
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
 * 홈 = 업로더 중심 Dashboard.
 * - partner(외부 편집자): PartnerHome — 두 공간(납품/보관함) 탭, 검수·받은편지함 없음.
 * - admin/member(매니저): ManagerHome — PartnerHome과 같은 디자인 언어(두 공간 탭 +
 *   슬림 업로드 + 상태 파일 리스트 + 드릴인) + 매니저 오버사이트(코멘트·공유·받은편지함) 하단.
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
    <ManagerHome
      userName={userName}
      personalSummary={personalData}
      recentFiles={recentFiles}
      newCommentsCount={newComments.length}
      pendingCount={inboxItems.length}
    >
      {/* 매니저 오버사이트 — 검수 코멘트 · 공유 활동 · 받은편지함 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NewCommentsCard comments={newComments} />
        <ShareActivityCard shares={shareActivity} />
      </div>
      <div className="mt-4">
        <InboxCard items={inboxItems} />
      </div>
    </ManagerHome>
  );
}
