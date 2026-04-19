import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "vimo_session";

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);

  // 로그인 페이지는 미인증만 접근 (로그인돼있으면 /로 보냄)
  if (pathname === "/login") {
    if (valid) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // API 및 /, /files/* 등은 인증 필수
  if (!valid) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 인증 검사 대상: 공개 에셋·내장 라우트 제외한 모든 경로
    // 제외:
    //  - api/upload/* (청크 init/chunk/complete 모두, 스트리밍·라우트 자체 인증)
    //  - s/*, api/s/* (공개 공유 링크)
    //  - _next/..., favicon, public
    "/((?!_next/static|_next/image|favicon.ico|public|api/upload|api/s/|s/).*)",
  ],
};
