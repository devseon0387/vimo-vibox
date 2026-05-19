import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  ProjectServices,
  DeployPlatform,
  DbPlatform,
  VcsPlatform,
} from './services';

const execFileAsync = promisify(execFile);

const HOME = process.env.HOME || '/';
const DEV_ROOT = path.join(HOME, 'Desktop/Dev');

export interface DevProject {
  id: string;
  name: string;
  path: string;
  absPath: string;
  description: string | null;
  techStack: string[];
  devPort: number | null;
  isRunning: boolean;
  lastModified: number;
  gitBranch: string | null;
  hasGit: boolean;
  hasPackageJson: boolean;
  hasDesignSystem: boolean;
  hasWireframes: boolean;
  hasRoadmap: boolean;
  hasERD: boolean;
  faviconUrl: string | null;
  /** .git/config · vercel.json · package.json deps 등에서 자동 감지한 값 */
  detectedServices: ProjectServices | null;
  /** git status --porcelain 결과 파일 수 (0 = clean, null = git 아님) */
  gitDirty: number | null;
  /** HEAD가 원격보다 앞선 커밋 수 (null = upstream 없음 / 비git) */
  gitAhead: number | null;
  /** HEAD가 원격보다 뒤쳐진 커밋 수 */
  gitBehind: number | null;
}

export const FAVICON_CANDIDATES = [
  // 루트 (Electron 앱 등)
  'icon.png',
  'icon.svg',
  'logo.png',
  'logo.svg',
  // Electron 빌드 리소스
  'build/icon.png',
  'build/icon.svg',
  'assets/icon.png',
  'assets/icon.svg',
  'resources/icon.png',
  // Next.js public/
  'public/favicon.ico',
  'public/favicon.png',
  'public/icon.png',
  'public/logo.png',
  'public/logo.svg',
  // Next.js app/
  'app/icon.png',
  'app/icon.svg',
  'app/icon.ico',
  'app/favicon.ico',
  'src/app/icon.png',
  'src/app/icon.svg',
  'src/app/favicon.ico',
];

interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ScanResult {
  root: string;
  count: number;
  projects: DevProject[];
}

function homeAbbreviate(p: string): string {
  return HOME && p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
}

function detectPort(scripts: Record<string, string> | undefined): number | null {
  if (!scripts?.dev) return null;
  const match = scripts.dev.match(/-p\s+(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function detectTechStack(
  pkg: PackageJson | null,
  extra: { pythonReq: boolean; pyproject: boolean; cmake: boolean; cargo: boolean; goMod: boolean; tauriConf: boolean; flaskFound: boolean },
): string[] {
  const stack: string[] = [];
  const deps: Record<string, string> = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  if (deps['next']) {
    const major = (deps['next'].replace(/[^\d.]/g, '').split('.')[0]) || '';
    stack.push(`Next.js${major ? ` ${major}` : ''}`);
  } else if (deps['@nestjs/core']) stack.push('NestJS');
  else if (deps['react']) stack.push('React');
  else if (deps['express']) stack.push('Express');
  else if (deps['vite']) stack.push('Vite');
  else if (pkg) stack.push('Node.js');

  if (deps['typescript']) stack.push('TS');
  if (deps['tailwindcss']) stack.push('Tailwind');
  if (deps['dexie']) stack.push('Dexie');
  if (deps['@supabase/supabase-js']) stack.push('Supabase');
  if (deps['prisma'] || deps['@prisma/client']) stack.push('Prisma');
  if (deps['better-sqlite3']) stack.push('SQLite');

  if (extra.pythonReq || extra.pyproject) stack.push('Python');
  if (extra.flaskFound) stack.push('Flask');
  if (extra.cmake) stack.push('C++');
  if (extra.cargo) stack.push('Rust');
  if (extra.goMod) stack.push('Go');
  if (extra.tauriConf) stack.push('Tauri');

  return stack;
}

async function checkFile(dir: string, rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, rel));
    return true;
  } catch {
    return false;
  }
}

async function hasFolder(projectPath: string, rels: string[]): Promise<boolean> {
  const checks = await Promise.all(
    rels.map(async (rel) => {
      try {
        const st = await fs.stat(path.join(projectPath, rel));
        return st.isDirectory();
      } catch {
        return false;
      }
    }),
  );
  return checks.some(Boolean);
}

// 한 번의 lsof 호출로 LISTEN 중인 모든 포트 수집
async function listListeningPorts(): Promise<Set<number>> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const ports = new Set<number>();
    for (const line of stdout.split('\n')) {
      const m = line.match(/:(\d+)\s+\(LISTEN\)/);
      if (m) ports.add(parseInt(m[1], 10));
    }
    return ports;
  } catch {
    return new Set();
  }
}

async function getGitBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, 'branch', '--show-current'], {
      timeout: 2000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * git status + upstream 비교. 비git이거나 timeout 시 모두 null.
 */
async function getGitStatus(projectPath: string): Promise<{
  dirty: number | null;
  ahead: number | null;
  behind: number | null;
}> {
  let dirty: number | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'status', '--porcelain'],
      { timeout: 3000, maxBuffer: 2 * 1024 * 1024 },
    );
    const trimmed = stdout.trim();
    dirty = trimmed === '' ? 0 : trimmed.split('\n').length;
  } catch {}

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { timeout: 2000 },
    );
    const [a, b] = stdout.trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (!Number.isNaN(a)) ahead = a;
    if (!Number.isNaN(b)) behind = b;
  } catch {
    // upstream 없거나 비교 불가
  }

  return { dirty, ahead, behind };
}

// favicon 후보 12개를 병렬 체크 후 첫 히트 반환
async function findFavicon(projectPath: string): Promise<string | null> {
  const results = await Promise.all(
    FAVICON_CANDIDATES.map((rel) => checkFile(projectPath, rel)),
  );
  const idx = results.findIndex(Boolean);
  return idx >= 0 ? FAVICON_CANDIDATES[idx] : null;
}

/**
 * .git/config의 remote origin URL 을 읽어 VCS 플랫폼과 HTTPS URL 추론.
 * - git@github.com:user/repo.git  → github, github.com/user/repo
 * - https://gitlab.com/user/repo  → gitlab
 * - ssh://git@bitbucket.org/user/repo.git → bitbucket
 */
async function detectVcs(projectPath: string): Promise<ProjectServices['vcs'] | undefined> {
  try {
    const config = await fs.readFile(path.join(projectPath, '.git/config'), 'utf-8');
    // [remote "origin"] 섹션의 url 라인 우선, 없으면 아무 url
    const originMatch = config.match(/\[remote\s+"origin"\][^\[]*?url\s*=\s*(.+)/);
    const raw = (originMatch?.[1] ?? config.match(/^\s*url\s*=\s*(.+)/m)?.[1] ?? '').trim();
    if (!raw) return undefined;

    // 정규화 → HTTPS 형태
    let normalized = raw
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/^ssh:\/\/git@/, 'https://')
      .replace(/\.git$/, '');
    if (normalized.startsWith('http://')) normalized = normalized.replace('http://', 'https://');

    const hostMatch = normalized.match(/https?:\/\/([^/]+)/);
    const host = hostMatch?.[1]?.toLowerCase() ?? '';
    let platform: VcsPlatform = 'github';
    if (host.includes('gitlab')) platform = 'gitlab';
    else if (host.includes('bitbucket')) platform = 'bitbucket';

    const url = normalized.replace(/^https?:\/\//, '');
    return { platform, url };
  } catch {
    return undefined;
  }
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** 설정 파일 존재 여부로 배포 플랫폼 감지 + URL 추정 */
async function detectDeploy(
  projectPath: string,
  pkg: PackageJson | null,
): Promise<ProjectServices['deploy'] | undefined> {
  const [vercelJson, vercelDir, netlifyToml, netlifyDir, wrangler, fly, railway] = await Promise.all([
    checkFile(projectPath, 'vercel.json'),
    checkFile(projectPath, '.vercel/project.json'),
    checkFile(projectPath, 'netlify.toml'),
    checkFile(projectPath, '.netlify/state.json'),
    checkFile(projectPath, 'wrangler.toml'),
    checkFile(projectPath, 'fly.toml'),
    checkFile(projectPath, 'railway.json'),
  ]);

  let platform: DeployPlatform | null = null;
  if (vercelJson || vercelDir) platform = 'vercel';
  else if (netlifyToml || netlifyDir) platform = 'netlify';
  else if (wrangler) platform = 'cloudflare';
  else if (fly) platform = 'fly';
  else if (railway) platform = 'railway';

  if (!platform) return undefined;

  // URL 추정 (확정은 아님 → note로 표시)
  let url: string | undefined;
  let note: string | undefined;

  if (platform === 'vercel') {
    // vercel.json > package.json name 순으로 {name}.vercel.app 추정
    const raw = await tryReadFile(path.join(projectPath, 'vercel.json'));
    let vercelName: string | undefined;
    try {
      if (raw) vercelName = (JSON.parse(raw) as { name?: string }).name;
    } catch {}
    const nameBase = vercelName || pkg?.name;
    if (nameBase) {
      url = `${sanitizeDomain(nameBase)}.vercel.app`;
      note = '추정 URL (Vercel 기본 도메인)';
    }
  } else if (platform === 'fly') {
    const raw = await tryReadFile(path.join(projectPath, 'fly.toml'));
    const m = raw?.match(/^\s*app\s*=\s*"([^"]+)"/m);
    if (m) url = `${m[1]}.fly.dev`;
  } else if (platform === 'netlify') {
    const raw = await tryReadFile(path.join(projectPath, 'netlify.toml'));
    const m = raw?.match(/name\s*=\s*"([^"]+)"/);
    if (m) {
      url = `${m[1]}.netlify.app`;
      note = '추정 URL (Netlify 기본 도메인)';
    }
  } else if (platform === 'cloudflare') {
    const raw = await tryReadFile(path.join(projectPath, 'wrangler.toml'));
    const m = raw?.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m) {
      url = `${m[1]}.workers.dev`;
      note = '추정 URL (Workers 기본 도메인)';
    }
  }

  return note ? { platform, url, note } : { platform, url };
}

function sanitizeDomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** package.json 의존성으로 DB 플랫폼 감지 */
function detectDb(pkg: PackageJson | null): ProjectServices['db'] | undefined {
  if (!pkg) return undefined;
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  let platform: DbPlatform | null = null;
  let note: string | undefined;

  if (deps['@supabase/supabase-js']) platform = 'supabase';
  else if (deps['better-sqlite3'] || deps['sqlite3']) platform = 'sqlite';
  else if (deps['@planetscale/database']) platform = 'planetscale';
  else if (deps['pg'] || deps['postgres']) platform = 'postgres';
  else if (deps['mysql'] || deps['mysql2']) platform = 'mysql';
  else if (deps['firebase'] || deps['firebase-admin']) platform = 'firestore';
  else if (deps['mongodb'] || deps['mongoose']) platform = 'mongodb';
  else if (deps['drizzle-orm']) {
    platform = 'postgres';
    note = 'Drizzle ORM 감지 (실제 DB 확인 필요)';
  } else if (deps['@prisma/client'] || deps['prisma']) {
    platform = 'postgres';
    note = 'Prisma 감지 (실제 DB 확인 필요)';
  }
  if (!platform) return undefined;
  return note ? { platform, note } : { platform };
}

async function scanOne(
  projectPath: string,
  name: string,
  listeningPorts: Set<number>,
): Promise<DevProject | null> {
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) return null;

    let pkg: PackageJson | null = null;
    try {
      const raw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8');
      pkg = JSON.parse(raw);
    } catch {}

    const [
      pythonReq, pyproject, cmake, cargo, goMod, tauriConf, hasGit,
      hasDesignSystem, hasWireframes, hasRoadmap, hasERD,
      faviconRel,
    ] = await Promise.all([
      checkFile(projectPath, 'requirements.txt'),
      checkFile(projectPath, 'pyproject.toml'),
      checkFile(projectPath, 'CMakeLists.txt'),
      checkFile(projectPath, 'Cargo.toml'),
      checkFile(projectPath, 'go.mod'),
      checkFile(projectPath, 'src-tauri/tauri.conf.json'),
      checkFile(projectPath, '.git'),
      hasFolder(projectPath, ['src/design', 'design']),
      hasFolder(projectPath, ['src/wireframes', 'wireframes']),
      hasFolder(projectPath, ['src/roadmap', 'roadmap']),
      hasFolder(projectPath, ['src/erd', 'erd']),
      findFavicon(projectPath),
    ]);

    const flaskFound = pythonReq
      ? await fs
          .readFile(path.join(projectPath, 'requirements.txt'), 'utf-8')
          .then((c) => /^flask/mi.test(c))
          .catch(() => false)
      : false;

    const techStack = detectTechStack(pkg, {
      pythonReq, pyproject, cmake, cargo, goMod, tauriConf, flaskFound,
    });

    const devPort = detectPort(pkg?.scripts);
    const isRunning = devPort ? listeningPorts.has(devPort) : false;
    const faviconUrl = faviconRel ? `/api/dev/favicon/${encodeURIComponent(name)}` : null;

    // Git 정보 병렬
    const [gitBranch, gitStatus] = await Promise.all([
      hasGit ? getGitBranch(projectPath) : Promise.resolve(null),
      hasGit ? getGitStatus(projectPath) : Promise.resolve({ dirty: null, ahead: null, behind: null }),
    ]);

    // 서비스 자동 감지 (병렬)
    const [vcs, deploy] = await Promise.all([
      hasGit ? detectVcs(projectPath) : Promise.resolve(undefined),
      detectDeploy(projectPath, pkg),
    ]);
    const db = detectDb(pkg);
    const detected: ProjectServices = {};
    if (vcs) detected.vcs = vcs;
    if (deploy) detected.deploy = deploy;
    if (db) detected.db = db;
    const detectedServices: ProjectServices | null =
      Object.keys(detected).length > 0 ? detected : null;

    return {
      id: name,
      name: pkg?.name || name,
      path: homeAbbreviate(projectPath),
      absPath: projectPath,
      description: pkg?.description?.trim() || null,
      techStack,
      devPort,
      isRunning,
      lastModified: stat.mtimeMs,
      gitBranch,
      hasGit,
      hasPackageJson: !!pkg,
      hasDesignSystem,
      hasWireframes,
      hasRoadmap,
      hasERD,
      faviconUrl,
      detectedServices,
      gitDirty: gitStatus.dirty,
      gitAhead: gitStatus.ahead,
      gitBehind: gitStatus.behind,
    };
  } catch (err) {
    console.error(`[scan-projects] scan failed for ${name}`, err);
    return null;
  }
}

// TTL 캐시 (같은 요청 폭주 방지 + 30s 폴링 부담 완화)
const CACHE_TTL_MS = 5_000;
let cached: { at: number; result: ScanResult } | null = null;
let inflight: Promise<ScanResult> | null = null;

async function scanFresh(): Promise<ScanResult> {
  const entries = await fs.readdir(DEV_ROOT, { withFileTypes: true });
  const dirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules',
  );

  const listeningPorts = await listListeningPorts();
  const scans = await Promise.all(
    dirs.map((d) => scanOne(path.join(DEV_ROOT, d.name), d.name, listeningPorts)),
  );
  const projects = scans
    .filter((p): p is DevProject => p !== null)
    .sort((a, b) => b.lastModified - a.lastModified);

  return {
    root: homeAbbreviate(DEV_ROOT),
    count: projects.length,
    projects,
  };
}

export async function scanDevProjects(options?: { force?: boolean }): Promise<ScanResult> {
  const now = Date.now();
  if (!options?.force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }
  if (inflight) return inflight;
  inflight = scanFresh()
    .then((result) => {
      cached = { at: Date.now(), result };
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
