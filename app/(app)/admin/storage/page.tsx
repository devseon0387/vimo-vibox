import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { StorageAdmin } from "@/components/StorageAdmin";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1000px]">
      <StorageAdmin />
    </div>
  );
}
