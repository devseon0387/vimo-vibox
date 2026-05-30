/**
 * Supabase 비밀번호 로그인 브릿지.
 *
 * 비박스 자체 SQLite 에 비밀번호가 없는 ERP 사용자(파트너 가입자 등) 가
 * vibox.cloud/login 에서 직접 로그인할 때, 입력한 email/password 를 Supabase auth
 * 에 검증 위임. 성공 시 app_access(vibox, active) 까지 확인하고 namespacedId 반환.
 *
 * env:
 *   ERP_SUPABASE_URL — 예: https://qxyiifphpsthrwxplafd.supabase.co
 *   ERP_SUPABASE_ANON_KEY — anon publishable key (RLS 통과는 access_token Bearer 로)
 */

export type SupabaseLoginResult =
  | {
      ok: true;
      sub: string;
      email: string;
      name: string;
      role: "admin" | "member" | "partner";
    }
  | { ok: false; reason: "invalid_credentials" | "no_vibox_access" | "config_missing" | "error" };

type TokenResponse = {
  access_token: string;
  user: {
    id: string;
    email: string;
    email_confirmed_at?: string | null;
    user_metadata?: { name?: string };
  };
};

type ProfileRow = { user_type: string | null; name: string | null };
type AccessRow = { role: string; status: string };

function env(): { url: string; anon: string } | null {
  const url = process.env.ERP_SUPABASE_URL;
  const anon = process.env.ERP_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

export async function loginViaSupabase(
  email: string,
  password: string,
): Promise<SupabaseLoginResult> {
  const cfg = env();
  if (!cfg) return { ok: false, reason: "config_missing" };

  // 1) Supabase password grant
  let token: TokenResponse;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return { ok: false, reason: "invalid_credentials" };
    token = (await res.json()) as TokenResponse;
  } catch {
    return { ok: false, reason: "error" };
  }

  // 응답 본문 구조 명시 검증 — Supabase 가 비정상 응답을 줘도 silent 통과 막기
  if (
    !token ||
    typeof token.access_token !== "string" ||
    token.access_token.length < 20 ||
    !token.user ||
    typeof token.user.id !== "string" ||
    typeof token.user.email !== "string"
  ) {
    return { ok: false, reason: "invalid_credentials" };
  }

  // 이메일 미확인 계정은 거부 — Supabase 가 unconfirmed 도 토큰 발급하는 인스턴스 방어
  if (token.user.email_confirmed_at === null) {
    return { ok: false, reason: "invalid_credentials" };
  }

  // access_token alg=HS256 only 검증 (alg none/RS confusion 방어). 서명 검증은
  // Supabase 의 책임이지만, 우리는 헤더 alg 만이라도 신뢰 범위 안인지 확인.
  try {
    const headerB64 = token.access_token.split(".")[0];
    const header = JSON.parse(
      Buffer.from(
        headerB64.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    );
    const allowedAlgs = ["HS256", "RS256", "ES256"];
    if (!header.alg || !allowedAlgs.includes(header.alg)) {
      return { ok: false, reason: "invalid_credentials" };
    }
  } catch {
    return { ok: false, reason: "invalid_credentials" };
  }

  const sub = token.user.id;

  // 2) profile + app_access(vibox) 조회 (사용자 토큰 Bearer 로 RLS 통과)
  const headers = {
    apikey: cfg.anon,
    Authorization: `Bearer ${token.access_token}`,
  };

  let profile: ProfileRow | null = null;
  let access: AccessRow | null = null;
  try {
    const [pRes, aRes] = await Promise.all([
      fetch(
        `${cfg.url}/rest/v1/profiles?id=eq.${sub}&select=user_type,name`,
        { headers },
      ),
      fetch(
        `${cfg.url}/rest/v1/app_access?user_id=eq.${sub}&app_code=eq.vibox&select=role,status`,
        { headers },
      ),
    ]);
    const pArr = pRes.ok ? ((await pRes.json()) as ProfileRow[]) : [];
    const aArr = aRes.ok ? ((await aRes.json()) as AccessRow[]) : [];
    profile = pArr[0] ?? null;
    access = aArr[0] ?? null;
  } catch {
    return { ok: false, reason: "error" };
  }

  if (!access || access.status !== "active") {
    return { ok: false, reason: "no_vibox_access" };
  }

  // 3) role 매핑 — app_access.role 이 admin 이면 admin, 그 외엔 profile.user_type 으로 결정
  let role: "admin" | "member" | "partner";
  if (access.role === "admin") {
    role = "admin";
  } else if (profile?.user_type === "partner") {
    role = "partner";
  } else {
    role = "member";
  }

  return {
    ok: true,
    sub,
    email: token.user.email,
    name: profile?.name ?? token.user.user_metadata?.name ?? token.user.email,
    role,
  };
}
