/**
 * 런타임 의존성 헬스 체크 — 운영에서 누락된 binary/env 를 일찍 발견하기 위한 진단 유틸.
 *
 * 사용 패턴:
 *   - `/api/health/deps` GET — 운영 모니터링용 (모든 체크 결과 + degraded 여부)
 *   - 라우트별 lazy 검증: 의존 작업 직전에 `requireBins(["ffmpeg","claude"])`
 *
 * 정책:
 *   - 라우트가 의존 binary 없이 실행되면 즉시 throw → 500 응답 + 명확한 메시지
 *   - 무관한 라우트는 영향 없음 (lazy 검증이라 boot blocking X)
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export type DepCheck = {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
};

const FFMPEG = process.env.FFMPEG_BIN || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "/opt/homebrew/bin/ffprobe";
const CLAUDE =
  process.env.CLAUDE_BIN || `${process.env.HOME ?? ""}/.local/bin/claude`;
const OCR =
  process.env.OCR_BIN_PATH || path.join(process.cwd(), "scripts", "ocr");

const REQUIRED_BINS: Record<string, string> = {
  ffmpeg: FFMPEG,
  ffprobe: FFPROBE,
  claude: CLAUDE,
  ocr: OCR,
};

async function probeBin(
  bin: string,
  args: string[] = ["-version"],
): Promise<string | null> {
  if (!existsSync(bin)) return null;
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve(null);
    }, 3000);
    proc.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0 && code !== null) return resolve(null);
      resolve(out.split("\n")[0].slice(0, 120).trim() || "ok");
    });
    proc.on("error", () => {
      clearTimeout(t);
      resolve(null);
    });
  });
}

function checkEnv(name: string, required = true): DepCheck {
  const v = process.env[name];
  return {
    name: `env:${name}`,
    required,
    ok: typeof v === "string" && v.length > 0,
    detail: v ? "set" : "missing",
  };
}

async function checkBin(label: string, bin: string, args?: string[]): Promise<DepCheck> {
  const ver = await probeBin(bin, args);
  return {
    name: `bin:${label}`,
    required: true,
    ok: ver !== null,
    detail: ver ?? `not found at ${bin}`,
  };
}

export async function runDepsCheck(): Promise<{
  ok: boolean;
  checks: DepCheck[];
}> {
  const results = await Promise.all([
    Promise.resolve(checkEnv("AUTH_SECRET")),
    Promise.resolve(checkEnv("STORAGE_ROOT")),
    Promise.resolve(checkEnv("DATABASE_URL", false)),
    Promise.resolve(checkEnv("ERP_SUPABASE_URL", false)),
    Promise.resolve(checkEnv("ERP_SUPABASE_ANON_KEY", false)),
    checkBin("ffmpeg", FFMPEG),
    checkBin("ffprobe", FFPROBE),
    checkBin("claude", CLAUDE, ["--version"]),
    checkBin("ocr", OCR, ["--help"]),
  ]);
  const ok = results.every((r) => r.ok || !r.required);
  return { ok, checks: results };
}

/**
 * 라우트가 진입 시 필수 의존성 검증 — 부재 시 throw.
 * 호출자가 try/catch 로 잡아 500 + 안내 메시지 응답.
 */
export function requireBins(names: Array<keyof typeof REQUIRED_BINS>): void {
  const missing: string[] = [];
  for (const n of names) {
    const bin = REQUIRED_BINS[n];
    if (!bin || !existsSync(bin)) missing.push(`${n} (${bin})`);
  }
  if (missing.length > 0) {
    throw new Error(`의존 binary 누락: ${missing.join(", ")}`);
  }
}

export function requireEnv(names: string[]): void {
  const missing: string[] = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v || v.length === 0) missing.push(n);
  }
  if (missing.length > 0) {
    throw new Error(`환경 변수 누락: ${missing.join(", ")}`);
  }
}
