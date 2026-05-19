/**
 * 비모 ERP (Supabase) 와 통신.
 * 단방향 read-only — Vibox 가 ERP 데이터를 가져옴. ERP 는 Vibox 모름.
 *
 * env:
 *  - ERP_SUPABASE_URL
 *  - ERP_SUPABASE_SERVICE_ROLE_KEY
 *
 * PostgREST 표준 REST 엔드포인트 사용. 별도 SDK 없음 (의존성 최소화).
 */

export type ErpClient = {
  id: string; // uuid
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  status: string; // 'active' | ...
  notes: string | null;
  created_at: string; // ISO
  updated_at: string;
};

function erpEnv(): { url: string; key: string } {
  const url = process.env.ERP_SUPABASE_URL;
  const key = process.env.ERP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "ERP_SUPABASE_URL / ERP_SUPABASE_SERVICE_ROLE_KEY env not set",
    );
  }
  return { url, key };
}

/**
 * 비모 ERP 의 clients 목록 조회.
 *  - 기본 필터: 26-03-01 이후 생성된 것만
 *  - 정렬: 최근 생성 순
 */
export async function fetchErpClients(
  options?: { since?: string; limit?: number },
): Promise<ErpClient[]> {
  const { url, key } = erpEnv();
  const since = options?.since ?? "2026-03-01T00:00:00Z";
  const limit = options?.limit ?? 200;

  const qs = new URLSearchParams();
  qs.set("created_at", `gte.${since}`);
  qs.set("select", "*");
  qs.set("order", "created_at.desc");
  qs.set("limit", String(limit));

  const r = await fetch(`${url}/rest/v1/clients?${qs.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    // ERP DB 데이터라 캐시 짧게
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`ERP fetch failed: ${r.status} ${text.slice(0, 200)}`);
  }
  return (await r.json()) as ErpClient[];
}
