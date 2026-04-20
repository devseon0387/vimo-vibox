import { listTrash, autoExpireOldTrash } from "@/lib/fs/trash";
import { TrashView } from "@/components/TrashView";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const session = await getCurrentSession();
  await autoExpireOldTrash(30).catch(() => {});
  const items = await listTrash();

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      <TrashView items={items} isAdmin={session?.role === "admin"} />
    </div>
  );
}
