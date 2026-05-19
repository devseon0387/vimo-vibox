import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { checkSameOrigin, csrfDeny } from "@/lib/auth/csrf";

const SESSION_COOKIE = "vimo_session";
const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

type SessionPayload = {
  sub: string;
  username: string;
  name: string | null;
  role: "admin" | "member" | "partner";
};

async function decodeSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as unknown as SessionPayload;
  } catch {
    return null;
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
      "connect-src 'self' https://u1.vibox.cloud https://u2.vibox.cloud https://u1.vibox.cloud:8443 https://u2.vibox.cloud:8443 https://u1.vibox.cloud:18443 https://u2.vibox.cloud:18443",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  let session = await decodeSession(cookieToken);

  // Bearer 토큰 (데스크탑 앱) — cookie 없으면 fallback
  let isBearerAuth = false;
  if (!session) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const bearerToken = auth.slice(7).trim();
      session = await decodeSession(bearerToken);
      if (session) isBearerAuth = true;
    }
  }

  // 로그인 페이지는 미인증만 접근 (로그인돼있으면 /로 보냄)
  if (pathname === "/login") {
    if (session) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/", req.url)),
      );
    }
    return withSecurityHeaders(NextResponse.next());
  }

  // 데스크탑 앱 로그인 endpoint — 인증 없이 접근 가능 (자체 rate limit 보유)
  if (pathname === "/api/desktop/login") {
    return withSecurityHeaders(NextResponse.next());
  }

  // API 및 /, /files/* 등은 인증 필수
  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  // CSRF 보호 — 쿠키 기반 인증 + 변경 메서드(POST/PATCH/DELETE/PUT)에 대해
  // Origin / Referer 검증. 정상 같은 오리진 요청은 통과, cross-site는 차단.
  // Bearer 토큰 인증은 CSRF 무관 (쿠키 자동 전송 X) — 스킵.
  if (!isBearerAuth && MUTATING_METHODS.has(req.method) && !checkSameOrigin(req)) {
    return withSecurityHeaders(csrfDeny());
  }

  // admin 전용 경로 가드 — /admin/*, /dev/*, /api/admin/*, /api/dev/notes (제외 목록 밖)
  const isAdminPath =
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/dev/") ||
    pathname.startsWith("/api/admin/");
  if (isAdminPath && session.role !== "admin") {
    // API는 JSON 403, 페이지는 / 로
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        NextResponse.json({ error: "admin only" }, { status: 403 }),
      );
    }
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/", req.url)),
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // 인증 검사 대상: 공개 에셋·내장 라우트 제외한 모든 경로
    // 제외:
    //  - api/upload/* (청크 init/chunk/complete 모두, 스트리밍·라우트 자체 인증)
    //  - api/sso/* (외부 ERP SSO 핸드오프 — 라우트 자체에서 JWT 검증)
    //  - api/dev/* (외부 ERP 프록시 — DEV_PROXY_TOKEN Bearer 인증)
    //  - api/notes/* (외부 클라이언트 — vbx_ 토큰 Bearer 인증, 라우트에서 검증)
    //  - s/*, api/s/* (공개 공유 링크)
    //  - _next/..., favicon, public
    //  - 루트 정적 이미지/아이콘 (logo.png 등) — Next/Image 최적화기의 내부 페치도 통과해야 함
    //
    // 모든 prefix exclude는 trailing `/` 또는 정확 일치만 허용 — 앞으로 추가될
    // /api/notes-public 같은 hostname-collision 라우트가 의도치 않게 인증 우회되는 것 방지.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif)$|public|api/upload(?:/|$)|api/sso(?:/|$)|api/dev(?:/|$)|api/external(?:/|$)|api/notes(?:/|$)|api/s/|s/).*)",
  ],
};
