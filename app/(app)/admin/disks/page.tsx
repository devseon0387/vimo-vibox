import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { listVolumes, browseUnderZone } from "@/lib/disks";
import { getBackupStatus } from "@/lib/backup-status";
import { DisksPane } from "@/components/admin/DisksPane";

export const dynamic = "force-dynamic";

export default async function AdminDisksPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const params = await searchParams;
  const [volumes, backup] = await Promise.all([
    listVolumes(),
    getBackupStatus(),
  ]);
  const drilldown = params.path
    ? await browseUnderZone(params.path).catch(() => null)
    : null;

  return (
    <DisksPane
      volumes={volumes}
      backup={backup}
      initialPath={params.path ?? null}
      initialDrilldown={drilldown}
    />
  );
}
