import { NextRequest, NextResponse } from "next/server";
import { desc, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";
import { generateToken, ALL_SCOPES, type Scope } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const session = await getCurrentSession();
  if (!session) return { err: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (session.role !== "admin")
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;

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

  return NextResponse.json({
    tokens: rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: parseScopes(r.scopes),
      createdAt: r.createdAt.getTime(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.getTime() : null,
      revokedAt: r.revokedAt ? r.revokedAt.getTime() : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("err" in g) return g.err;

  let body: { name?: string; scopes?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "name too long" }, { status: 400 });

  const requestedScopes = Array.isArray(body.scopes) ? body.scopes : [];
  const scopes = requestedScopes.filter((s): s is Scope =>
    ALL_SCOPES.includes(s as Scope),
  );
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: `at least one valid scope required (${ALL_SCOPES.join(", ")})` },
      { status: 400 },
    );
  }

  const { raw, hash, prefix } = generateToken();
  const id = randomUUID();
  const now = new Date();

  await db.insert(apiTokens).values({
    id,
    name,
    tokenHash: hash,
    prefix,
    scopes: JSON.stringify(scopes),
    createdBy: g.session.sub,
    createdAt: now,
  });

  return NextResponse.json({
    id,
    name,
    prefix,
    scopes,
    createdAt: now.getTime(),
    raw,                  // ❗ 한 번만 응답. 절대 DB에 저장 안 함.
  });
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
