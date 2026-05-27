import { NextResponse } from "next/server";

// 공개 키 — 클라이언트가 SW push subscribe 시 사용. 인증 없어도 OK (공개키).
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }
  return NextResponse.json({ enabled: true, key });
}
