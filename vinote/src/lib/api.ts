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

export type Facets = {
  folders: { name: string; n: number }[];
  tags: { name: string; n: number }[];
  total: number;
  starred: number;
};

export async function getFacets(): Promise<Facets> {
  const r = await request<Facets>(`/api/notes/v2/facets`);
  return r.data ?? { folders: [], tags: [], total: 0, starred: 0 };
}

export async function searchNotes(q: string, limit = 20): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const r = await request<{ hits: SearchHit[] }>(`/api/notes/v2/search?${qs}`);
  return r.data?.hits ?? [];
}

export async function runAi(prompt: string, system?: string): Promise<string> {
  const r = await request<{ text: string }>(`/api/notes/v2/ai`, {
    method: "POST",
    body: JSON.stringify({ prompt, system }),
  });
  if (r.error) throw new Error(r.error);
  return r.data?.text ?? "";
}

export type NoteVersion = {
  id: string;
  savedAt: number;
  savedBy: string | null;
  reason: string | null;
  bytes: number | null;
};

export async function listVersions(path: string, limit = 50): Promise<NoteVersion[]> {
  const qs = new URLSearchParams({ path, limit: String(limit) });
  const r = await request<{ versions: NoteVersion[] }>(`/api/notes/v2/versions?${qs}`);
  return r.data?.versions ?? [];
}

export async function getVersion(id: string): Promise<
  | { id: string; path: string; body: string; savedAt: number; reason: string | null }
  | null
> {
  const qs = new URLSearchParams({ id });
  const r = await request<{ id: string; path: string; body: string; savedAt: number; reason: string | null }>(
    `/api/notes/v2/version?${qs}`,
  );
  return r.data;
}

export type Suggestion = { path: string; title: string };

export async function suggest(q: string, limit = 10): Promise<Suggestion[]> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const r = await request<{ suggestions: Suggestion[] }>(`/api/notes/v2/suggest?${qs}`);
  return r.data?.suggestions ?? [];
}

export async function restoreVersion(
  path: string,
  versionId: string,
): Promise<{ ok: boolean; mtimeMs?: number; error?: string }> {
  const r = await request<{ ok: boolean; mtimeMs: number }>(`/api/notes/v2/restore`, {
    method: "POST",
    body: JSON.stringify({ path, versionId }),
  });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, mtimeMs: r.data?.mtimeMs };
}

export function vibxLoginUrl(): string {
  return `${API_BASE}/login`;
}

export function viboxBaseUrl(): string {
  return API_BASE;
}
