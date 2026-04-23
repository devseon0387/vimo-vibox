import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { MyStatsClient } from "./my-stats-client";

// 내 기록 — 파트너(편집자) 전용 회고 페이지
// 본인이 업로드한 파일에 받은 피드백·칭찬을 집계해서 성장 지표로 보여줌
export default async function MyStatsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/my/stats");
  // staff 도 기술적으로 접근 가능하지만 본인 업로드 없으면 빈 데이터만 나옴
  // admin 관점 리포트는 /admin 영역에 별도 추가 예정

  return <MyStatsClient name={session.name ?? session.username} />;
}
