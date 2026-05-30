import { NextRequest } from "next/server";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { runClaude } from "@/lib/ai-claude";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * POST /api/notes/v2/ai
 * body: { prompt: string, system?: string }
 * → { text: string }
 *
 * 단일 사용자 IP 기반 rate limit (분당 30회) — 무한 호출 방지.
 */
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;
  const session = g.session;

  const ip = getClientIp(req);
  const rl = rateLimit(`notes-ai:${session.sub}:${ip}`, { max: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { error: "rate limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...cors, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { prompt?: string; system?: string } | null;
  if (!body?.prompt || typeof body.prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400, headers: cors });
  }

  // 프롬프트 상한 (DoS 방지)
  if (body.prompt.length > 50_000) {
    return Response.json({ error: "prompt too long (max 50000)" }, { status: 413, headers: cors });
  }

  try {
    const text = await runClaude({ prompt: body.prompt, system: body.system });
    return Response.json({ text }, { headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ai failed";
    return Response.json({ error: msg }, { status: 500, headers: cors });
  }
}
