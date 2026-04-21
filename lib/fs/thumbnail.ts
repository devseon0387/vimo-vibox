import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { getStorageRoot, resolveSafePath } from "./storage";

const VIDEO_EXTS = new Set([
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "m4v",
]);

export function isVideoPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return VIDEO_EXTS.has(ext);
}

/** 경로 기반 해시로 썸네일 파일 이름 결정 (이름 바뀌면 자동 재생성) */
export function thumbHash(relativePath: string): string {
  return createHash("sha1")
    .update(relativePath, "utf-8")
    .digest("hex")
    .slice(0, 16);
}

export function getThumbRoot(): string {
  return path.join(getStorageRoot(), ".vibox", "thumbs");
}

export function getThumbPath(relativePath: string): string {
  return path.join(getThumbRoot(), `${thumbHash(relativePath)}.jpg`);
}

export async function hasThumb(relativePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(getThumbPath(relativePath));
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function removeThumb(relativePath: string): Promise<void> {
  try {
    await fs.rm(getThumbPath(relativePath), { force: true });
  } catch {
    /* orphan 허용 */
  }
}

/**
 * ffmpeg로 대표 프레임 추출 후 JPEG 저장.
 * thumbnail 필터는 N 프레임 중 가장 의미있는 것을 고름 (단색 프레임 회피)
 * 장면 전환 지점의 프레임을 선택하므로 첫 프레임보다 훨씬 나음
 */
export async function generateThumb(relativePath: string): Promise<boolean> {
  if (!isVideoPath(relativePath)) return false;

  const srcAbs = resolveSafePath(relativePath);
  try {
    await fs.access(srcAbs);
  } catch {
    return false;
  }

  const thumbAbs = getThumbPath(relativePath);
  await fs.mkdir(path.dirname(thumbAbs), { recursive: true });

  // 먼저 파일 길이 확인해서 오프셋 결정 (기본 2초, 짧으면 10%)
  const seekSec = await estimateSeekSec(srcAbs);

  return new Promise<boolean>((resolve) => {
    // -ss 를 -i 앞에 두면 빠른 seek, 뒤에 두면 정확한 seek
    // 썸네일 목적이라 빠른 seek + thumbnail 필터
    const args = [
      "-y",
      "-ss",
      seekSec.toFixed(2),
      "-i",
      srcAbs,
      "-vf",
      "thumbnail,scale='min(640,iw)':-2",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      thumbAbs,
    ];

    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    const timer = setTimeout(() => proc.kill("SIGKILL"), 30_000);

    proc.on("exit", async (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(true);
      } else {
        // 실패 시 고아 파일 정리
        await fs.rm(thumbAbs, { force: true }).catch(() => {});
        resolve(false);
      }
    });
    proc.on("error", async () => {
      clearTimeout(timer);
      await fs.rm(thumbAbs, { force: true }).catch(() => {});
      resolve(false);
    });
  });
}

async function estimateSeekSec(srcAbs: string): Promise<number> {
  return new Promise<number>((resolve) => {
    let output = "";
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        srcAbs,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    proc.stdout.on("data", (b) => {
      output += b.toString();
    });
    const timer = setTimeout(() => proc.kill("SIGKILL"), 5_000);
    proc.on("exit", () => {
      clearTimeout(timer);
      const dur = parseFloat(output.trim());
      if (!Number.isFinite(dur) || dur <= 0) return resolve(2);
      if (dur < 4) return resolve(dur * 0.1);
      resolve(Math.min(2, dur * 0.05));
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(2);
    });
  });
}

/** 백그라운드 생성: 응답 블로킹하지 않음. 에러는 로그만 */
export function generateThumbInBackground(relativePath: string): void {
  generateThumb(relativePath).catch((err) => {
    console.warn("[thumb] generation failed:", relativePath, err);
  });
}

// ─────────────────────────────────────────────────────
// 프레임 시점별 썸네일 (타임라인 호버 프리뷰용)
// ─────────────────────────────────────────────────────

export function getFrameThumbPath(relativePath: string, seconds: number): string {
  const tBucket = Math.max(0, Math.floor(seconds));
  return path.join(
    getThumbRoot(),
    `${thumbHash(relativePath)}_${tBucket}.jpg`,
  );
}

export async function hasFrameThumb(
  relativePath: string,
  seconds: number,
): Promise<boolean> {
  try {
    const stat = await fs.stat(getFrameThumbPath(relativePath, seconds));
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function generateFrameThumb(
  relativePath: string,
  seconds: number,
): Promise<boolean> {
  if (!isVideoPath(relativePath)) return false;

  const srcAbs = resolveSafePath(relativePath);
  try {
    await fs.access(srcAbs);
  } catch {
    return false;
  }

  const thumbAbs = getFrameThumbPath(relativePath, seconds);
  await fs.mkdir(path.dirname(thumbAbs), { recursive: true });

  const seekSec = Math.max(0, Math.floor(seconds));

  return new Promise<boolean>((resolve) => {
    const args = [
      "-y",
      "-ss",
      seekSec.toFixed(2),
      "-i",
      srcAbs,
      "-vf",
      "scale='min(320,iw)':-2",
      "-frames:v",
      "1",
      "-q:v",
      "6",
      thumbAbs,
    ];
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    const timer = setTimeout(() => proc.kill("SIGKILL"), 10_000);
    proc.on("exit", async (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(true);
      else {
        await fs.rm(thumbAbs, { force: true }).catch(() => {});
        resolve(false);
      }
    });
    proc.on("error", async () => {
      clearTimeout(timer);
      await fs.rm(thumbAbs, { force: true }).catch(() => {});
      resolve(false);
    });
  });
}
