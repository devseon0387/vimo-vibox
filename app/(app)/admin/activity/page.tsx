import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getRecentActivity } from "@/lib/admin-activity";
import { ActivityFeed } from "@/components/admin/ActivityFeed";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const entries = await getRecentActivity(150);
  return (
    <div className="px-8 py-6 max-w-[1100px]">
      <h1 className="text-[22px] font-extrabold mb-1">활동 로그</h1>
      <p className="text-[13px] text-text-soft mb-6">
        업로드, 공유 링크 생성, 다운로드를 시간순으로 통합 표시합니다.
      </p>
      <ActivityFeed entries={entries} />
    </div>
  );
}
