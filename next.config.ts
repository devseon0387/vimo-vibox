import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 업로드는 /api/upload 라우트에서 busboy로 스트리밍 처리.
  // 미들웨어 matcher에서 /api/upload를 제외해 바디 버퍼링 방지 → 파일 크기 무제한.

  async redirects() {
    return [
      // 구 URL → 신 URL (외부에 뿌린 북마크·링크 호환)
      { source: "/v", destination: "/vimo-box", permanent: false },
      { source: "/v/:path*", destination: "/vimo-box/:path*", permanent: false },
      { source: "/me/stats", destination: "/my/stats", permanent: false },
      { source: "/api/me/stats", destination: "/api/my/stats", permanent: false },
    ];
  },

  // 전역 보안 헤더 — proxy.ts는 matcher가 정적 자산 제외하므로 정적 응답에 헤더 누락됨.
  // 여기서 모든 경로에 기본 헤더 부착 (proxy.ts가 추가로 CSP 등 동적 헤더 부착).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
