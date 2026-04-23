import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { StatsAdmin } from "@/components/StatsAdmin";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "member") redirect("/");

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1200px]">
      <StatsAdmin />
    </div>
  );
}
