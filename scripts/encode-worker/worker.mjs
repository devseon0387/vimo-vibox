#!/usr/bin/env node
/**
 * vibox 인코딩 워커 (아이맥 등 원격 머신용).
 *
 * 맥미니의 vibox 앱과 **같은 DB 큐(encoding_jobs)**를 공유하며, 동일한
 * conditional UPDATE(status='queued') atomic claim 으로 작업을 집어간다 → 중복 처리 없음.
 * 빈 슬롯이 먼저 잡으므로 "맥미니 1 + 아이맥 N" 분산이 자연스럽게 성립한다.
 *
 * 작업 흐름 (job 1건):
 *   1) 원본을 맥미니에서 rsync 로 로컬로 가져온다 (mtime 보존 → fingerprint 일치)
 *   2) 로컬에서 ffmpeg(VideoToolbox) 로 1080p 5Mbps HLS 인코딩 (hls.ts 와 동일 설정)
 *   3) 결과(HLS 디렉토리)를 맥미니 스토리지로 rsync
 *   4) hls_assets / encoding_jobs 갱신 후 로컬 임시파일 정리
 *
 * 자체 완결형: 의존성은 `postgres`(postgres-js) 하나뿐 → node 25 에서도 네이티브 모듈 이슈 없음.
 * 설정은 환경변수(.env) 로 주입한다. WORKER_DB_URL 필수.
 */
import postgres from "postgres";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// 최소 .env 로더 (의존성 없이): worker.mjs 와 같은 폴더의 .env 를 읽어 주입.
// 비밀(WORKER_DB_URL)을 plist/리포에 넣지 않고 .env(0600)로만 둔다.
try {
  const t = await fs.readFile(new URL("./.env", import.meta.url), "utf8");
  for (const ln of t.split("\n")) {
    const m = ln.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* .env 없으면 실제 환경변수만 사용 */ }

// ---- 설정 (env) ----
const DB_URL = process.env.WORKER_DB_URL;
const MINI_SSH = process.env.MINI_SSH || "vimo_server@172.30.1.82";
const MINI_SSH_PORT = process.env.MINI_SSH_PORT || ""; // 비면 기본 22 (socat 경유 시 2222 등)
const MINI_SSH_KEY = process.env.MINI_SSH_KEY || ""; // ssh -i 키 파일 (망루는 기본 위치가 아님)
const MINI_STORAGE_ROOT = process.env.MINI_STORAGE_ROOT || "/Volumes/Vibox Storage A/Shared";
const WORK_DIR = process.env.WORKER_WORK_DIR || "/tmp/vibox-encode";
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2);
const FFMPEG = process.env.FFMPEG_BIN || "/usr/local/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "/usr/local/bin/ffprobe";
// 인코더: 기본 videotoolbox(macOS). 망루=h264_nvenc. EXTRA로 -preset 등 추가.
const VIDEO_ENCODER = process.env.VIDEO_ENCODER || "h264_videotoolbox";
const VIDEO_ENCODER_EXTRA = (process.env.VIDEO_ENCODER_EXTRA || "").split(/\s+/).filter(Boolean);
// 전송 바이너리(크로스플랫폼): Windows=System32의 ssh.exe/tar.exe가 PATH에 있음.
const SSH_BIN = process.env.SSH_BIN || "ssh";
const TAR_BIN = process.env.TAR_BIN || "tar";
const POLL_MS = Number(process.env.WORKER_POLL_MS) || 5000;
const STALE_MIN = Number(process.env.WORKER_STALE_MIN) || 40; // 진행 중 작업 회수 임계 (좀비 방지)
const MAX_ATTEMPTS = 3;

if (!DB_URL) { console.error("FATAL: WORKER_DB_URL 환경변수 필요"); process.exit(1); }
const sql = postgres(DB_URL, { prepare: false });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escSpace = (p) => p.replace(/ /g, "\\ "); // rsync 원격경로 공백 이스케이프 (구/신 rsync 호환)

/** file_path → 스토리지 머신(Linux) 절대경로 (storage.ts zone 로직 복제).
 *  ★원격은 항상 POSIX 경로 — 워커가 Windows 라도 path.posix 사용(백슬래시 방지). */
function miniAbsPath(filePath) {
  const P = path.posix;
  const base = P.dirname(MINI_STORAGE_ROOT); // 예: /opt/vibox-storage
  const p = filePath.startsWith("/") ? filePath : "/" + filePath;
  if (p === "/library" || p.startsWith("/library/")) return P.join(base, "Library", p.slice("/library".length));
  if (p === "/personal" || p.startsWith("/personal/")) return P.join(base, "Personal", p.slice("/personal".length));
  if (p === "/notes" || p.startsWith("/notes/")) return P.join(base, "Notes", p.slice("/notes".length));
  return P.join(MINI_STORAGE_ROOT, p); // rendering (기본)
}

/** hls.ts fingerprintOf 복제 — head/mid/tail 1MB + size + mtime → sha256 앞 16자리. */
async function fingerprintOf(absVideo) {
  const stat = await fs.stat(absVideo);
  const fh = await fs.open(absVideo, "r");
  try {
    const sampleSize = Math.min(1024 * 1024, stat.size);
    const head = Buffer.alloc(sampleSize);
    await fh.read(head, 0, sampleSize, 0);
    const hash = createHash("sha256").update(head);
    if (stat.size > sampleSize * 2) {
      const mid = Buffer.alloc(sampleSize);
      await fh.read(mid, 0, sampleSize, Math.max(0, Math.floor(stat.size / 2) - sampleSize / 2));
      hash.update(mid);
    }
    if (stat.size > sampleSize) {
      const tail = Buffer.alloc(sampleSize);
      await fh.read(tail, 0, sampleSize, Math.max(0, stat.size - sampleSize));
      hash.update(tail);
    }
    hash.update(`-${stat.size}-${Math.floor(stat.mtimeMs)}`);
    return hash.digest("hex").slice(0, 16);
  } finally { await fh.close(); }
}

function run(cmd, args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", errTail = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => { errTail = (errTail + d).slice(-4096); onStderr?.(d.toString()); });
    p.on("error", reject);
    p.on("exit", (code) => code === 0 ? resolve({ out }) : reject(new Error(`${cmd} exit ${code}: ${errTail.slice(-400)}`)));
  });
}

async function probeDuration(absVideo) {
  const { out } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absVideo]);
  const v = parseFloat(out.trim());
  return Number.isFinite(v) ? v : 0;
}

/** hls.ts 와 동일: 1080p 5Mbps h264_videotoolbox + AAC 128k, 10초 세그먼트. */
async function encodeHLS(srcAbs, outDir, totalDuration, onPct) {
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(outDir, { recursive: true });
  const args = [
    "-y", "-i", srcAbs,
    "-c:v", VIDEO_ENCODER, ...VIDEO_ENCODER_EXTRA, "-b:v", "5M", "-maxrate", "6M", "-bufsize", "10M",
    "-c:a", "aac", "-b:a", "128k",
    "-f", "hls", "-hls_time", "10", "-hls_playlist_type", "vod", "-hls_segment_type", "mpegts",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.join(outDir, "segment_%03d.ts"),
    "-progress", "pipe:2", "-nostats", path.join(outDir, "playlist.m3u8"),
  ];
  await run(FFMPEG, args, {
    onStderr: (t) => {
      const m = t.match(/out_time_ms=(\d+)/);
      if (m && totalDuration > 0 && onPct) onPct(Math.min(99, Math.floor((parseInt(m[1], 10) / 1e6 / totalDuration) * 100)));
    },
  });
}

async function summarize(dir) {
  const entries = await fs.readdir(dir);
  let totalBytes = 0, segmentCount = 0;
  for (const e of entries) {
    if (e.endsWith(".ts")) segmentCount++;
    totalBytes += (await fs.stat(path.join(dir, e))).size;
  }
  return { segmentCount, totalBytes };
}

// 원격(Linux) 셸용 single-quote 이스케이프 (공백·#·:·한글 등). 로컬측은 argv 직접 전달이라 셸 불요.
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function sshArgv(remoteCmd) {
  const a = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];
  if (MINI_SSH_PORT) a.push("-p", String(MINI_SSH_PORT));
  if (MINI_SSH_KEY) a.push("-i", MINI_SSH_KEY);
  a.push(MINI_SSH, remoteCmd);
  return a;
}
// 두 child를 stdout→stdin 파이프로 직접 연결 (bash 불요, 크로스플랫폼).
// pipefail 대용: 어느 쪽이든 비0 종료/에러면 reject + 상대 kill, 둘 다 exit0이면 resolve.
function pipeTransfer(producer, consumer) {
  return new Promise((resolve, reject) => {
    let pErr = "", cErr = "", settled = false, ok = 0;
    const prod = spawn(producer.cmd, producer.args, { stdio: ["ignore", "pipe", "pipe"] });
    const cons = spawn(consumer.cmd, consumer.args, { stdio: ["pipe", "ignore", "pipe"] });
    const fail = (e) => { if (settled) return; settled = true; try { prod.kill(); } catch {} try { cons.kill(); } catch {} reject(e); };
    const succeed = () => { if (settled) return; if (++ok === 2) { settled = true; resolve(); } };
    prod.stderr.on("data", (d) => { pErr = (pErr + d).slice(-4096); });
    cons.stderr.on("data", (d) => { cErr = (cErr + d).slice(-4096); });
    prod.on("error", fail);
    cons.on("error", fail);
    prod.stdout.on("error", () => {}); // consumer 조기종료 시 EPIPE 무시
    cons.stdin.on("error", () => {});
    prod.stdout.pipe(cons.stdin);
    prod.on("exit", (c) => c === 0 ? succeed() : fail(new Error(`${producer.cmd} exit ${c}: ${pErr.slice(-300)}`)));
    cons.on("exit", (c) => c === 0 ? succeed() : fail(new Error(`${consumer.cmd} exit ${c}: ${cErr.slice(-300)}`)));
  });
}
// 전송 = tar-over-ssh: rsync 버전 의존성 제거 + mtime 보존(fingerprint 일관) + 특수문자 안전.
async function pullFile(remoteAbs, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  // 원격(Linux) 경로는 path.posix (워커가 Windows 라도 백슬래시 금지). destDir 은 로컬(native).
  // ★파일명 NFC/NFD 혼용: 디스크가 macOS 출신이면 NFD, Linux 출신이면 NFC.
  //   DB(file_path)와 디스크 정규화가 다를 수 있어 둘 다 시도해 존재하는 쪽을 tar.
  const parent = path.posix.dirname(remoteAbs);
  const base = path.posix.basename(remoteAbs);
  const nfc = base.normalize("NFC"), nfd = base.normalize("NFD");
  const remoteTar = `cd ${shq(parent)} && for n in ${shq(nfc)} ${shq(nfd)}; do [ -e "$n" ] && exec tar -cf - -- "$n"; done; echo "src not found (NFC/NFD): ${shq(base)}" >&2; exit 2`;
  // 원격 tar(ssh) → 로컬 tar 추출(destDir 에 원래 파일명으로). 추출 파일은 호출측이 readdir로 찾음.
  await pipeTransfer(
    { cmd: SSH_BIN, args: sshArgv(remoteTar) },
    { cmd: TAR_BIN, args: ["-C", destDir, "-xf", "-"] },
  );
}
async function pushDir(localDir, remoteDir) {
  // localDir basename == remoteDir basename(=fingerprint) 이어야 함.
  // 원격(Linux) 경로는 path.posix, 로컬(localDir)은 native.
  const remoteParent = path.posix.dirname(remoteDir);
  const remoteCmd = `mkdir -p ${shq(remoteParent)} && tar -C ${shq(remoteParent)} -xf -`;
  // 로컬 tar → 원격 추출(ssh).
  await pipeTransfer(
    { cmd: TAR_BIN, args: ["-C", path.dirname(localDir), "-cf", "-", "--", path.basename(localDir)] },
    { cmd: SSH_BIN, args: sshArgv(remoteCmd) },
  );
}

async function claimNext() {
  const [row] = await sql`SELECT id, file_path FROM encoding_jobs WHERE status='queued' ORDER BY enqueued_at LIMIT 1`;
  if (!row) return null;                                          // 큐 비었음
  const upd = await sql`UPDATE encoding_jobs SET status='running', started_at=now(), progress=0 WHERE id=${row.id} AND status='queued'`;
  if (upd.count === 0) return undefined;                          // 다른 워커가 선점 → 다음 후보
  return row;
}

async function runJob(job) {
  const jobDir = path.join(WORK_DIR, `job-${job.id}`);
  const srcDir = path.join(jobDir, "src");
  try {
    log(`claim ${job.id} :: ${job.file_path}`);
    await pullFile(miniAbsPath(job.file_path), srcDir);
    const pulled = (await fs.readdir(srcDir)).filter((f) => !f.startsWith("."));
    if (pulled.length === 0) throw new Error("pull 결과 파일 없음 — 원격 tar 전송 실패 의심");
    const srcLocal = path.join(srcDir, pulled[0]);
    const fingerprint = await fingerprintOf(srcLocal);
    const hlsDir = path.join(jobDir, fingerprint); // 디렉토리명=fingerprint (tar push 시 그대로 매칭)
    const duration = await probeDuration(srcLocal);
    let last = -5;
    await encodeHLS(srcLocal, hlsDir, duration, async (pct) => {
      if (pct - last >= 5) { last = pct; await sql`UPDATE encoding_jobs SET progress=${pct} WHERE id=${job.id}`.catch(() => {}); }
    });
    const { segmentCount, totalBytes } = await summarize(hlsDir);
    await pushDir(hlsDir, `${MINI_STORAGE_ROOT}/.vibox/hls/${fingerprint}`);
    const durSec = Math.round(duration);
    await sql`INSERT INTO hls_assets (fingerprint, file_path, segment_count, total_bytes, duration_sec, created_at)
              VALUES (${fingerprint}, ${job.file_path}, ${segmentCount}, ${totalBytes}, ${durSec}, now())
              ON CONFLICT (file_path) DO UPDATE SET fingerprint=${fingerprint}, segment_count=${segmentCount}, total_bytes=${totalBytes}, duration_sec=${durSec}`;
    await sql`UPDATE encoding_jobs SET status='done', progress=100, finished_at=now(), fingerprint=${fingerprint}, duration_sec=${durSec} WHERE id=${job.id}`;
    log(`done  ${job.id} :: fp=${fingerprint} seg=${segmentCount} ${(totalBytes / 1048576).toFixed(1)}MB`);
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 800);
    log(`ERROR ${job.id} :: ${msg}`);
    const [cur] = await sql`SELECT attempts FROM encoding_jobs WHERE id=${job.id}`.catch(() => [{ attempts: MAX_ATTEMPTS }]);
    const next = (cur?.attempts ?? 0) + 1;
    if (next < MAX_ATTEMPTS) {
      await sql`UPDATE encoding_jobs SET status='queued', progress=0, started_at=null, error=${`attempt ${next}: ${msg}`}, attempts=${next} WHERE id=${job.id}`.catch(() => {});
    } else {
      await sql`UPDATE encoding_jobs SET status='failed', finished_at=now(), error=${msg}, attempts=${next} WHERE id=${job.id}`.catch(() => {});
    }
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 좀비 회수: STALE_MIN 초과로 running 인 작업만 큐로 되돌림 (다른 워커의 진행 중 작업은 건드리지 않음). */
async function reclaimStale() {
  await sql`UPDATE encoding_jobs SET status='queued', progress=0, started_at=null
            WHERE status='running' AND started_at < now() - make_interval(mins => ${STALE_MIN})`.catch(() => {});
}

let active = 0, stopping = false;
async function shutdown(sig) {
  if (stopping) process.exit(0); // 두 번째 신호 = 즉시 종료
  stopping = true;
  log(`${sig} 수신 — 진행 중(${active}건) 마무리 후 종료`);
  const deadline = Date.now() + 20_000;
  while (active > 0 && Date.now() < deadline) await sleep(500);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(0); // 열린 DB 커넥션이 이벤트루프를 잡고 있어 명시적 종료 필요
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function loop() {
  log(`vibox encode-worker 시작 (concurrency=${CONCURRENCY}, mini=${MINI_SSH})`);
  await reclaimStale();
  let sinceReclaim = 0;
  while (!stopping) {
    while (active < CONCURRENCY) {
      const job = await claimNext().catch((e) => { log(`claim err: ${e.message}`); return null; });
      if (job === null) break;        // 큐 비었음
      if (job === undefined) continue; // 경쟁에서 짐 → 다음 후보 즉시 시도
      active++;
      runJob(job).finally(() => { active--; });
    }
    await sleep(POLL_MS);
    if ((sinceReclaim += POLL_MS) >= 5 * 60 * 1000) { sinceReclaim = 0; await reclaimStale(); }
  }
  log("종료 신호 — 진행 중 작업 마무리 후 종료");
}

loop().catch((e) => { console.error(e); process.exit(1); });
