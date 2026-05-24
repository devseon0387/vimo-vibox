/**
 * 비박스 API 호출 wrapper.
 * - cross-subdomain 쿠키 자동 전송 (credentials: include)
 * - 401이면 비박스 로그인으로 리다이렉트
 */

const API_BASE = process.env.NEXT_PUBLIC_VIBOX_API ?? "https://vibox.cloud";

export type NoteSummary = {
  path: string;
  title: string | null;
  excerpt: string | null;
  tags: string[];
  folder: string | null;
  wordCount: number | null;
  mtimeMs: number;
  starred: boolean;
};

export type NoteDetail = {
  path: string;
  body: string;
  meta: Record<string, unknown>;
  mtimeMs: number;
  bytes: number;
};

export type SaveResult =
  | { ok: true; mtimeMs: number }
  | { ok: false; conflict: true; serverMtimeMs: number; serverBody: string }
  | { ok: false; conflict: false; error: string };

export type SearchHit = {
  path: string;
  title: string;
  snippet: string;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T | null; error: string | null }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = `${API_BASE}/login?from=${encodeURIComponent(window.location.href)}`;
    }
    return { status: 401, data: null, error: "unauthorized" };
  }
  let data: T | null = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const errMsg = (data as unknown as { error?: string })?.error ?? `HTTP ${res.status}`;
    return { status: res.status, data, error: errMsg };
  }
  return { status: res.status, data, error: null };
}

// ───── notes API ─────

export async function listNotes(opts: {
  folder?: string;
  tag?: string;
  starred?: boolean;
  limit?: number;
} = {}): Promise<NoteSummary[]> {
  const qs = new URLSearchParams();
  if (opts.folder) qs.set("folder", opts.folder);
  if (opts.tag) qs.set("tag", opts.tag);
  if (opts.starred) qs.set("starred", "1");
  if (opts.limit) qs.set("limit", String(opts.limit));
  const r = await request<{ items: NoteSummary[] }>(`/api/notes/v2/list?${qs}`);
  return r.data?.items ?? [];
}

export async function getNote(path: string): Promise<NoteDetail | null> {
  const r = await request<NoteDetail>(`/api/notes/v2/get?path=${encodeURIComponent(path)}`);
  return r.data;
}

export async function saveNote(opts: {
  path: string;
  body: string;
  meta?: Record<string, unknown>;
  ifMatch?: number;
  manual?: boolean;
}): Promise<SaveResult> {
  const r = await request<{ ok: true; mtimeMs: number } | { error: string; serverMtimeMs?: number; serverBody?: string }>(
    `/api/notes/v2/save`,
    { method: "POST", body: JSON.stringify(opts) },
  );
  if (r.status === 409 && r.data && "serverMtimeMs" in r.data) {
    return {
      ok: false,
      conflict: true,
      serverMtimeMs: r.data.serverMtimeMs!,
      serverBody: r.data.serverBody ?? "",
    };
  }
  if (r.error) {
    return { ok: false, conflict: false, error: r.error };
  }
  return { ok: true, mtimeMs: (r.data as { mtimeMs: number }).mtimeMs };
}

export async function starNote(path: string, starred: boolean): Promise<boolean> {
  const r = await request<{ ok: true }>(`/api/notes/v2/star`, {
    method: "POST",
    body: JSON.stringify({ path, starred }),
  });
  return !r.error;
}

export async function searchNotes(q: string, limit = 20): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const r = await request<{ hits: SearchHit[] }>(`/api/notes/v2/search?${qs}`);
  return r.data?.hits ?? [];
}

export function vibxLoginUrl(): string {
  return `${API_BASE}/login`;
}

export function viboxBaseUrl(): string {
  return API_BASE;
}
