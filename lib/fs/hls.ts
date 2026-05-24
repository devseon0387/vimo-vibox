import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { getStorageRoot } from "./storage";

/**
 * HLS 생성·관리.
 *
 * 전략:
 *  - 단일 비트레이트 1080p 5Mbps H.264 + AAC (호환성·캐시 효율)
 *  - 10초 세그먼트 (CF Free 512MB 한도 안전, 시크 빠름)
 *  - VideoToolbox 하드웨어 인코딩 (Intel/Apple Silicon 모두 자동)
 *  - fingerprint = sha256(원본 파일 첫 4MB + 크기 + mtime).substring(0, 16)
 *      → 같은 파일이면 같은 fingerprint, 변경 시 자동 무효화
 *
 * 디렉토리 구조:
 *  /Volumes/Vibox Storage A/.vibox/hls/{fingerprint}/
 *      playlist.m3u8
 *      segment_000.ts
 *      segment_001.ts
 *      ...
 *
 * 실행 시간 (Intel iMac 2019 기준):
 *  - 1080p 10분 → 2~4분
 *  - 4K 10분 (1080p로 다운스케일) → 4~6분
 */

export type HLSResult = {
  fingerprint: string;
  outputDir: string;
  manifestPath: string;
  segmentCount: number;
  totalBytes: number;
  durationSec: number;
};

export type HLSProgress = (percent: number) => void;

/** 파일 fingerprint — 앞·중간·뒤 1MB 샘플 + size + mtime.
 *  mtime-preserve rsync로 다른 내용을 같은 mtime에 덮는 케이스도 잡힘. */
export async function fingerprintOf(absVideoPath: string): Promise<string> {
  const stat = await fs.stat(absVideoPath);
  const fh = await fs.open(absVideoPath, "r");
  try {
    const sampleSize = Math.min(1024 * 1024, stat.size);
    const head = Buffer.alloc(sampleSize);
    await fh.read(head, 0, sampleSize, 0);
    const hash = createHash("sha256");
    hash.update(head);
    if (stat.size > sampleSize * 2) {
      const mid = Buffer.alloc(sampleSize);
      const midOffset = Math.max(0, Math.floor(stat.size / 2) - sampleSize / 2);
      await fh.read(mid, 0, sampleSize, midOffset);
      hash.update(mid);
    }
    if (stat.size > sampleSize) {
      const tail = Buffer.alloc(sampleSize);
      await fh.read(tail, 0, sampleSize, Math.max(0, stat.size - sampleSize));
      hash.update(tail);
    }
    hash.update(`-${stat.size}-${Math.floor(stat.mtimeMs)}`);
    return hash.digest("hex").slice(0, 16);
  } finally {
    await fh.close();
  }
}

export function getHLSRoot(): string {
  return path.join(getStorageRoot(), ".vibox", "hls");
}

export function getHLSDir(fingerprint: string): string {
  if (!/^[a-f0-9]{16}$/.test(fingerprint)) {
    throw new Error(`invalid fingerprint: ${fingerprint}`);
  }
  return path.join(getHLSRoot(), fingerprint);
}

export function getManifestPath(fingerprint: string): string {
  return path.join(getHLSDir(fingerprint), "playlist.m3u8");
}

export async function hlsExists(fingerprint: string): Promise<boolean> {
  try {
    await fs.access(getManifestPath(fingerprint));
    return true;
  } catch {
    return false;
  }
}

/** 영상 길이 (초) ffprobe 로 추출 */
async function probeDuration(absVideo: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        absVideo,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exit ${code}`));
      const v = parseFloat(out.trim());
      resolve(Number.isFinite(v) ? v : 0);
    });
  });
}

/**
 * 영상을 HLS 로 변환. 진행률 콜백 옵션.
 * 실패 시 출력 디렉토리 정리.
 */
export async function generateHLS(
  absVideoPath: string,
  onProgress?: HLSProgress,
): Promise<HLSResult> {
  const fingerprint = await fingerprintOf(absVideoPath);
  const outDir = getHLSDir(fingerprint);

  // 이미 존재하면 그대로 반환 (idempotent)
  if (await hlsExists(fingerprint)) {
    const manifest = getManifestPath(fingerprint);
    const stats = await summarize(outDir);
    return {
      fingerprint,
      outputDir: outDir,
      manifestPath: manifest,
      ...stats,
    };
  }

  const totalDuration = await probeDuration(absVideoPath);
  await fs.mkdir(outDir, { recursive: true });

  const args = [
    "-y",
    "-i",
    absVideoPath,
    // 비디오: VideoToolbox H.264 (HW 인코딩, Intel/Apple Silicon 자동 활용)
    "-c:v",
    "h264_videotoolbox",
    "-b:v",
    "5M",
    "-maxrate",
    "6M",
    "-bufsize",
    "10M",
    // 오디오: AAC 128k (호환성)
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    // HLS 옵션
    "-f",
    "hls",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "mpegts",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    path.join(outDir, "segment_%03d.ts"),
    // 진행률 stderr 파싱용
    "-progress",
    "pipe:2",
    "-nostats",
    path.join(outDir, "playlist.m3u8"),
  ];

  // 시작 전 partial outDir 정리 (이전 실패 attempt의 segment 잔존 방지)
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(outDir, { recursive: true });

  // wallclock timeout: max(영상길이 × 5, 30분). 좀비 ffmpeg 방지.
  const timeoutMs = Math.max(30 * 60 * 1000, Math.floor(totalDuration * 5 * 1000));

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    // stderr ring buffer (2KB) — 무한 누적 방지
    let stderrTail = "";
    const STDERR_KEEP = 2048;
    proc.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderrTail = (stderrTail + text).slice(-STDERR_KEEP);
      const m = text.match(/out_time_ms=(\d+)/);
      if (m && totalDuration > 0 && onProgress) {
        const seconds = parseInt(m[1], 10) / 1_000_000;
        const pct = Math.min(99, Math.floor((seconds / totalDuration) * 100));
        onProgress(pct);
      }
    });

    const killer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    proc.on("error", async (e) => {
      clearTimeout(killer);
      await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
      reject(e);
    });

    proc.on("exit", async (code, signal) => {
      clearTimeout(killer);
      if (code !== 0) {
        await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
        const reason = signal ? `signal=${signal}` : `exit=${code}`;
        reject(new Error(`ffmpeg ${reason}\n${stderrTail}`));
        return;
      }
      try {
        const stats = await summarize(outDir);
        resolve({
          fingerprint,
          outputDir: outDir,
          manifestPath: path.join(outDir, "playlist.m3u8"),
          ...stats,
          durationSec: Math.round(totalDuration),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function summarize(outDir: string): Promise<{
  segmentCount: number;
  totalBytes: number;
  durationSec: number;
}> {
  const entries = await fs.readdir(outDir);
  let totalBytes = 0;
  let segmentCount = 0;
  for (const e of entries) {
    if (e.endsWith(".ts")) segmentCount++;
    const stat = await fs.stat(path.join(outDir, e));
    totalBytes += stat.size;
  }
  return { segmentCount, totalBytes, durationSec: 0 };
}

/** HLS 자산 삭제 (원본 삭제·재인코딩 시) */
export async function removeHLS(fingerprint: string): Promise<void> {
  const dir = getHLSDir(fingerprint);
  await fs.rm(dir, { recursive: true, force: true });
}
