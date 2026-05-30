import { describe, it, expect } from "vitest";
import {
  createSession,
  verifySession,
  type SessionPayload,
} from "@/lib/auth/session";

describe("auth/session — JWT round-trip", () => {
  const sample: SessionPayload = {
    sub: "user-123",
    username: "seon",
    name: "seon",
    role: "admin",
  };

  it("발급한 토큰이 검증을 통과해 동일 payload 를 복원한다", async () => {
    const token = await createSession(sample, 60);
    const decoded = await verifySession(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.sub).toBe(sample.sub);
    expect(decoded?.role).toBe(sample.role);
    expect(decoded?.username).toBe(sample.username);
  });

  it("위조 토큰은 null 반환", async () => {
    const tampered = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.invalid";
    const decoded = await verifySession(tampered);
    expect(decoded).toBeNull();
  });

  it("만료된 토큰은 null 반환", async () => {
    // 발급 즉시 만료 (1ms maxAge → 충분히 짧음)
    const token = await createSession(sample, 0.001);
    await new Promise((r) => setTimeout(r, 1500)); // jose exp 는 초 단위 — 1.5초 대기
    const decoded = await verifySession(token);
    expect(decoded).toBeNull();
  });

  it("AUTH_SECRET 누락 시 토큰 발급 실패", async () => {
    const orig = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    await expect(createSession(sample)).rejects.toThrow();
    process.env.AUTH_SECRET = orig;
  });
});
