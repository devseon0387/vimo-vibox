import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { MyBoxClient } from "./my-box-client";

// My Box — 개인 드라이브 (드롭박스 스타일, 피드백·주석 없음)
// 데이터 격리: 서버에서 /personal/{session.sub}/... 경로로 강제 매핑
export default async function MyBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/my/box");

  const sp = await searchParams;
  const relPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";

  return (
    <MyBoxClient
      initialPath={relPath}
      userId={session.sub}
      userName={session.name ?? session.username}
    />
  );
}
