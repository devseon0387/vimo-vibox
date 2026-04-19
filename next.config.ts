import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 업로드는 /api/upload 라우트에서 busboy로 스트리밍 처리.
  // 미들웨어 matcher에서 /api/upload를 제외해 바디 버퍼링 방지 → 파일 크기 무제한.
};

export default nextConfig;
