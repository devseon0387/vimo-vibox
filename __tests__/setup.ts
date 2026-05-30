// 테스트용 env — 모든 테스트 전에 적용
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-secret-only-for-vitest-32chars-min";
process.env.STORAGE_ROOT =
  process.env.STORAGE_ROOT ?? "/tmp/vibox-test-storage";
(process.env as Record<string, string>).NODE_ENV = "test";
