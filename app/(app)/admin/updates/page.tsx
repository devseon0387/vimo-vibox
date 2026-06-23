import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { CHANGELOG } from "@/lib/changelog";
import { ChangelogTimeline } from "@/components/admin/ChangelogTimeline";

export const dynamic = "force-dynamic";

export default async function AdminUpdatesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "member") redirect("/");

  return (
    <div className="px-8 py-6 max-w-[900px]">
      <h1 className="text-2xl font-extrabold mb-1">업데이트 기록</h1>
      <p className="text-base text-text-soft mb-6">
        Vibox 버전별 변경 사항. 항목을 눌러 펼치면 추가/수정 상세를 확인할 수 있어요.
      </p>
      <ChangelogTimeline entries={CHANGELOG} />
    </div>
  );
}
