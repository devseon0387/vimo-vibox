import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("auth/supabase-bridge — loginViaSupabase", () => {
  // vitest 3 의 vi.spyOn globalThis.fetch 타이핑이 까다로워 any 캐스팅으로 회피.
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.ERP_SUPABASE_URL = "https://example.supabase.co";
    process.env.ERP_SUPABASE_ANON_KEY = "anon-key";
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("env 미설정 시 config_missing", async () => {
    delete process.env.ERP_SUPABASE_URL;
    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("a@b.com", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("config_missing");
  });

  it("Supabase 401 → invalid_credentials", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }),
    );
    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("a@b.com", "wrong");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_credentials");
  });

  it("vibox app_access 없으면 no_vibox_access", async () => {
    // token grant 성공
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature",
          user: { id: "u1", email: "a@b.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
        }),
        { status: 200 },
      ),
    );
    // profiles
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ user_type: "partner", name: "alice" }]), { status: 200 }),
    );
    // app_access — 빈 배열
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("a@b.com", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_vibox_access");
  });

  it("정상 흐름 — partner role 매핑", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature",
          user: { id: "u1", email: "a@b.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
        }),
        { status: 200 },
      ),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ user_type: "partner", name: "alice" }]), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ role: "member", status: "active" }]), {
        status: 200,
      }),
    );

    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("a@b.com", "pw");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.role).toBe("partner"); // profile.user_type=partner 우선
      expect(res.sub).toBe("u1");
    }
  });

  it("email_confirmed_at null 이면 invalid_credentials 로 거부", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig",
          user: { id: "u1", email: "unconfirmed@b.com", email_confirmed_at: null },
        }),
        { status: 200 },
      ),
    );
    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("unconfirmed@b.com", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_credentials");
  });

  it("access_token 형식 깨졌으면(JWT 헤더 디코드 실패) invalid_credentials", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "not-a-jwt-at-all",
          user: { id: "u1", email: "a@b.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
        }),
        { status: 200 },
      ),
    );
    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("a@b.com", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_credentials");
  });

  it("admin app_access — admin role 매핑 (profile.user_type 우선순위 무시)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature",
          user: { id: "u2", email: "boss@b.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
        }),
        { status: 200 },
      ),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ user_type: "staff", name: "boss" }]), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ role: "admin", status: "active" }]), { status: 200 }),
    );

    const { loginViaSupabase } = await import("@/lib/auth/supabase-bridge");
    const res = await loginViaSupabase("boss@b.com", "pw");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.role).toBe("admin");
  });
});
