/**
 * 서비스 메타데이터 타입 (Dev Workspace Deploy/DB/VCS 표시용)
 * server(scan-projects), client(registry, DevWorkspaceClient) 양쪽에서 공유.
 */

export type DeployPlatform =
  | 'vercel'
  | 'cloudflare'
  | 'netlify'
  | 'railway'
  | 'fly'
  | 'self'
  | 'local';

export type DbPlatform =
  | 'supabase'
  | 'sqlite'
  | 'postgres'
  | 'mysql'
  | 'planetscale'
  | 'firestore'
  | 'mongodb'
  | 'json'
  | 'none';

export type VcsPlatform = 'github' | 'gitlab' | 'bitbucket';

export interface ProjectServices {
  deploy?: { platform: DeployPlatform; url?: string; status?: 'live' | 'idle'; note?: string };
  db?: { platform: DbPlatform; note?: string };
  vcs?: { platform: VcsPlatform; url?: string };
}

/**
 * 두 ProjectServices를 머지. 우선 값(priority)이 차후 값(fallback)을 덮어쓴다.
 * 필드 단위 세밀 머지: platform/url/status/note 각각 priority가 정의됐으면 그걸 쓰고, 아니면 fallback.
 */
export function mergeServices(
  priority: ProjectServices | undefined,
  fallback: ProjectServices | undefined,
): ProjectServices | undefined {
  if (!priority && !fallback) return undefined;
  const p = priority ?? {};
  const f = fallback ?? {};
  const out: ProjectServices = {};
  if (p.deploy || f.deploy) {
    out.deploy = {
      platform: p.deploy?.platform ?? f.deploy?.platform ?? 'local',
      url: p.deploy?.url ?? f.deploy?.url,
      status: p.deploy?.status ?? f.deploy?.status,
      note: p.deploy?.note ?? f.deploy?.note,
    };
  }
  if (p.db || f.db) {
    out.db = {
      platform: p.db?.platform ?? f.db?.platform ?? 'none',
      note: p.db?.note ?? f.db?.note,
    };
  }
  if (p.vcs || f.vcs) {
    out.vcs = {
      platform: p.vcs?.platform ?? f.vcs?.platform ?? 'github',
      url: p.vcs?.url ?? f.vcs?.url,
    };
  }
  return Object.keys(out).length ? out : undefined;
}
