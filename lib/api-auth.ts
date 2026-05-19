import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

export type Scope =
  | "notes:read"
  | "notes:write";

export const ALL_SCOPES: Scope[] = ["notes:read", "notes:write"];

export type AuthedToken = {
  tokenId: string;
  ownerId: string;
  scopes: Scope[];
  name: string;
};

const TOKEN_PREFIX = "vbx_";

export function generateToken(): { raw: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const raw = `${TOKEN_PREFIX}${random}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function parseBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  return token;
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

export async function verifyApiToken(req: NextRequest): Promise<AuthedToken | null> {
  const raw = parseBearer(req);
  if (!raw) return null;
  const hash = hashToken(raw);
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.revokedAt) return null;

  // last_used_at 비동기 갱신 (응답 지연 X)
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return {
    tokenId: row.id,
    ownerId: row.createdBy,
    scopes: parseScopes(row.scopes),
    name: row.name,
  };
}

export async function requireScope(
  req: NextRequest,
  scope: Scope,
): Promise<{ token: AuthedToken } | NextResponse> {
  const token = await verifyApiToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "missing or invalid bearer token" },
      { status: 401 },
    );
  }
  if (!token.scopes.includes(scope)) {
    return NextResponse.json(
      { error: `token lacks scope '${scope}' (has: ${token.scopes.join(", ") || "none"})` },
      { status: 403 },
    );
  }
  return { token };
}
