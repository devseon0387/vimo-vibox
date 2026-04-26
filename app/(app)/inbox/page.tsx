import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/inbox");
  if (session.role === "partner") redirect("/");

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1100px]">
      <h1 className="text-[22px] font-bold mb-1">받은편지함</h1>
      <p className="text-[12.5px] text-text-muted mb-6">
        오늘 매니저가 봐야 할 것들 — 검수 대기 영상과 클라이언트 피드백 승인 대기.
      </p>
      <InboxClient />
    </div>
  );
}
