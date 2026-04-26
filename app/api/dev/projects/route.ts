import { NextRequest, NextResponse } from "next/server";
import { scanDevProjects, FAVICON_CANDIDATES } from "@/lib/dev/scan-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.DEV_PROXY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "DEV_PROXY_TOKEN not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") || "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (presented !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanDevProjects();
    return NextResponse.json({ ...result, faviconCandidates: FAVICON_CANDIDATES });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[dev/projects]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
