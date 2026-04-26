import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { ClientDetail } from "./client-detail";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "member") redirect("/");

  const { slug } = await params;
  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!c) notFound();

  return (
    <ClientDetail
      client={{
        id: c.id,
        name: c.name,
        slug: c.slug,
        contactEmail: c.contactEmail,
        notes: c.notes,
        active: c.active,
        createdAt: c.createdAt.getTime(),
      }}
    />
  );
}
