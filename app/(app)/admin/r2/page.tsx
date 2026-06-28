import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { R2List } from "./r2-list";

export const dynamic = "force-dynamic";

export default async function R2Page() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/admin/r2");
  if (session.role !== "admin") redirect("/");

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1100px]">
      <h1 className="text-2xl font-bold mb-1">R2 빠른 다운로드 캐시</h1>
      <p className="text-sm text-text-muted mb-6">
        외부에서 빠르게 받도록 R2(Cloudflare)에 올라가 있는 영상입니다. 정본은 항상 서버(M2)에 있어,
        여기서 내려도 파일은 사라지지 않고 다운로드만 서버로 폴백됩니다(느려질 뿐). 무료 용량 10GB 안에서
        자동 관리(영상 업로드 시 적재 · 오래된 것부터 축출 · 3일).
      </p>
      <R2List />
    </div>
  );
}
