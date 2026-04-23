import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { LibraryClient } from "./library-client";

// 자료실 — 팀 공용 레퍼런스·템플릿 (VIMO Box 하위)
// 모든 로그인 유저 읽기, staff 만 쓰기
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/vimo-box/library");

  const sp = await searchParams;
  const relPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";
  const isStaff = session.role === "admin" || session.role === "member";

  return <LibraryClient initialPath={relPath} isStaff={isStaff} />;
}
