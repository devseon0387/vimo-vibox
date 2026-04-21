import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { UsersAdmin, type AdminUser } from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      role: users.role,
      quotaGb: users.quotaGb,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const items: AdminUser[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email,
    role: r.role,
    quotaGb: r.quotaGb,
    createdAt: r.createdAt.getTime(),
  }));

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      <UsersAdmin items={items} currentUserId={session.sub} />
    </div>
  );
}
