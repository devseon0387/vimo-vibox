import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { SharesView, type ShareRow } from "@/components/SharesView";

export const dynamic = "force-dynamic";

export default async function SharesPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.createdBy, session.sub))
    .orderBy(desc(shareLinks.createdAt));

  const items: ShareRow[] = rows.map((r) => ({
    id: r.id,
    token: r.token,
    filePath: r.filePath,
    paths: r.paths ? (JSON.parse(r.paths) as string[]) : [r.filePath],
    title: r.title,
    mode: r.mode,
    hasPassword: !!r.passwordHash,
    expiresAt: r.expiresAt ? r.expiresAt.getTime() : null,
    downloadCount: r.downloadCount,
    createdAt: r.createdAt.getTime(),
  }));

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      <SharesView items={items} />
    </div>
  );
}
