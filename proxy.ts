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

// 보안 헤더 부착
function withSecurityHeaders(res: NextResponse): NextResponse {
  // 클릭재킹 방어
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  // MIME 스니핑 방어
  res.headers.set("X-Content-Type-Options", "nosniff");
  // Referrer 최소화
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HTTPS 강제 (프로덕션만, 1년)
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  // 권한 위임 차단
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), usb=()",
  );
  // CSP — Next.js 인라인 스타일/스크립트 있어 보수적으로 허용
  // 영상/이미지는 self + blob + data (ObjectURL)
  // connect-src: 업로드 샤딩용 서브도메인 (u1/u2.vibox.cloud) 허용
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src 'self' https://cdn.jsdelivr.net data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://u1.vibox.cloud https://u2.vibox.cloud",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);

  // 로그인 페이지는 미인증만 접근 (로그인돼있으면 /로 보냄)
  if (pathname === "/login") {
    if (valid) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/", req.url)),
      );
    }
    return withSecurityHeaders(NextResponse.next());
  }

  // API 및 /, /files/* 등은 인증 필수
  if (!valid) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // 인증 검사 대상: 공개 에셋·내장 라우트 제외한 모든 경로
    // 제외:
    //  - api/upload/* (청크 init/chunk/complete 모두, 스트리밍·라우트 자체 인증)
    //  - s/*, api/s/* (공개 공유 링크)
    //  - _next/..., favicon, public
    //  - 루트 정적 이미지/아이콘 (logo.png 등) — Next/Image 최적화기의 내부 페치도 통과해야 함
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif)$|public|api/upload|api/s/|s/).*)",
  ],
};
