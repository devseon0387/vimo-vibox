import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getShareIntel } from "@/lib/admin-share-intel";
import { ShareIntelView } from "@/components/admin/ShareIntelView";

export const dynamic = "force-dynamic";

export default async function AdminShareIntelPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const intel = await getShareIntel();
  return (
    <div className="px-8 py-6 max-w-[1200px]">
      <h1 className="text-[22px] font-extrabold mb-1">공유 인텔리전스</h1>
      <p className="text-[13px] text-text-soft mb-6">
        공유 링크로 접속한 방문자별 시청 진행도와 체류 시간 (admin 전용).
        영상이 아닌 파일은 열람 시각만 기록됩니다.
      </p>
      <ShareIntelView intel={intel} />
    </div>
  );
}
