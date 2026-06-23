import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";
import { TokensManager, type TokenRow } from "@/components/admin/TokensManager";
import { ALL_SCOPES, type Scope } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export default async function AdminKeysPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt));

  const tokens: TokenRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: parseScopes(r.scopes),
    createdAt: r.createdAt.getTime(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.getTime() : null,
    revokedAt: r.revokedAt ? r.revokedAt.getTime() : null,
  }));

  return (
    <div className="px-8 py-6 max-w-[1000px]">
      <h1 className="text-2xl font-extrabold mb-1">API 토큰</h1>
      <p className="text-base text-text-soft mb-6">
        외부 클라이언트(Claude, SEON Hub 등)가 비박스 API에 접근할 때 사용하는 베어러 토큰. 토큰은 발급 직후 한 번만 표시되고, 이후엔 prefix만 보입니다.
      </p>
      <TokensManager initial={tokens} availableScopes={ALL_SCOPES} />
    </div>
  );
}

function parseScopes(raw: string): Scope[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope));
  } catch {
    return [];
  }
}
