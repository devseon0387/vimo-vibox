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
};

export default nextConfig;
