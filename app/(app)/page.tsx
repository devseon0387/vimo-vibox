import { getCurrentSession } from "@/lib/auth/session";
import { SpaceCard } from "@/components/SpaceCard";
import { PartnerHome } from "@/components/PartnerHome";
import { MyFilesCarousel } from "@/components/dashboard/MyFilesCarousel";
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
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

/**
 * 홈 = 업로더 중심 Dashboard.
 *
 * 카드 우선순위 (역할별):
 * - admin/member(비모 매니저): 두 공간 → My Files → 새 코멘트 + 공유 활동 → 받은편지함
 * - admin/member(비모 제작자): 두 공간 → My Files → 새 코멘트 + 공유 활동
 * - partner(외부 편집자): 비모 공간만 → My Files (본인 폴더) → 새 코멘트
 *
 * partner는 My box 공간 자체가 노출 X (서버에서 분기).
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const isPartner = session.role === "partner";
  const isManager = session.role === "admin" || session.role === "member";
  const userName = session.name ?? session.username ?? "";
  const showPersonal = !isPartner;

  // 파트너(외부 편집자) 전용 홈 — 두 공간(내 보관함 + 비모 납품) 탭, 검수/받은편지함 없음.
  // 백엔드(개인 공간 격리·쿼터·업로드)는 이미 지원하므로 홈만 분기한다.
  if (isPartner) {
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

  // 병렬 페치 — 모든 쿼리 동시에
  const [personalData, recentFiles, newComments, shareActivity, inboxItems, teamSummary] =
    await Promise.all([
      showPersonal ? getPersonalSummary(session.sub) : Promise.resolve(null),
      getMyRecentFiles(session.sub, 5),
      getMyNewComments(session.sub, 5),
      getMyShareActivity(session.sub, 5),
      isManager ? getInboxItems(session.sub, 6) : Promise.resolve([]),
      getTeamSummary(session.sub),
    ]);

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {/* 인사 */}
      <div className="mb-6">
        <h1 className="text-[22px] md:text-[24px] font-bold">
          안녕하세요{userName ? `, ${userName}님` : ""}
        </h1>
        <DashboardGreeting
          newComments={newComments.length}
          inboxCount={inboxItems.length}
          isManager={isManager}
        />
      </div>

      {/* 두 공간 큰 카드 (1차 결정) */}
      <div
        className={`grid gap-4 mb-6 ${
          showPersonal ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {showPersonal && personalData && (
          <SpaceCard
            variant="personal"
            usedBytes={personalData.usedBytes}
            quotaBytes={personalData.quotaBytes}
            fileCount={personalData.fileCount}
            lastUploadAt={personalData.lastUploadAt}
          />
        )}
        <SpaceCard
          variant="team"
          pendingReviews={isManager ? teamSummary.pendingReviews : 0}
          newComments={teamSummary.newComments}
          inProgress={teamSummary.inProgress}
        />
      </div>

      {/* 내가 올린 파일 — 4행 carousel */}
      <div className="mb-6">
        <MyFilesCarousel files={recentFiles} />
      </div>

      {/* 활동 — 코멘트 + 공유 (2열) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <NewCommentsCard comments={newComments} />
        <ShareActivityCard shares={shareActivity} />
      </div>

      {/* 받은편지함 — 매니저 한정 */}
      {isManager && <InboxCard items={inboxItems} />}
    </div>
  );
}

/** SpaceCard team용 요약 — pendingReviews는 InboxCard와 같은 기준 */
async function getTeamSummary(userId: string) {
  const since24h = new Date(Date.now() - 86400_000);
  const since30d = new Date(Date.now() - 30 * 86400_000);

  const [pending, recentComments, recentUploads] = await Promise.all([
    // pendingReviews — InboxCard와 1:1
    db
      .select({ path: fileUploads.path })
      .from(fileUploads)
      .where(gte(fileUploads.uploadedAt, new Date(Date.now() - 14 * 86400_000)))
      .limit(200),
    // 내 파일 24h 새 코멘트 count
    db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(fileUploads)
      .where(and(eq(fileUploads.uploadedBy, userId), gte(fileUploads.uploadedAt, since24h)))
      .limit(1),
    // 내가 최근 30일 올린 비모 파일 (in-progress 추정)
    db
      .select({ path: fileUploads.path })
      .from(fileUploads)
      .where(and(eq(fileUploads.uploadedBy, userId), gte(fileUploads.uploadedAt, since30d))),
  ]);

  // 매니저용 inbox는 server side 다른 helper가 정확히 계산, 여기선 14일 업로드 개수만
  return {
    pendingReviews: pending.length,
    newComments: Number(recentComments[0]?.count ?? 0),
    inProgress: recentUploads.length,
  };
}

function DashboardGreeting({
  newComments,
  inboxCount,
  isManager,
}: {
  newComments: number;
  inboxCount: number;
  isManager: boolean;
}) {
  const parts: string[] = [];
  if (newComments > 0) parts.push(`새 코멘트 ${newComments}건`);
  if (isManager && inboxCount > 0) parts.push(`검수 대기 ${inboxCount}건`);
  if (parts.length === 0) {
    return <p className="text-[12.5px] text-text-faint mt-1">오늘도 좋은 작업 되세요</p>;
  }
  return <p className="text-[12.5px] text-text-faint mt-1">{parts.join(" · ")}</p>;
}
