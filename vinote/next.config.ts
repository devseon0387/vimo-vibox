import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 부모 디렉토리(vibox)의 proxy.ts·middleware.ts 등이 자동 감지되지 않도록
  // 워크스페이스 루트를 vinote 폴더로 고정
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
