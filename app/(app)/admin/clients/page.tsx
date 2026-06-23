import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { ClientsList } from "./clients-list";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/admin/clients");
  if (session.role !== "admin" && session.role !== "member") redirect("/");

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1100px]">
      <h1 className="text-2xl font-bold mb-1">클라이언트</h1>
      <p className="text-sm text-text-muted mb-6">
        외부 클라(광고주·브랜드)별 영상 컬렉션 관리. 한 영상이 여러 클라에 동시 공유될 수 있어요.
      </p>
      <ClientsList />
    </div>
  );
}
