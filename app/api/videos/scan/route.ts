import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, scanHistory } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { resolveSafePath } from "@/lib/fs/storage";
import { serializeAnnotation } from "@/lib/comments/annotation";
import { requireBins } from "@/lib/deps-health";
import {
  createScanJob,
  getScanJob,
  listRunningJobsForPath,
  publicView,
  cancelScanJob,
  bindProcess,
  markDone,
  markFailed,
  parseStageFromOutput,
  updateProgress,
} from "@/lib/scan-jobs";

const SCAN_SCRIPT = path.join(process.cwd(), "scripts", "subtitle-scan.sh");
const FRAME_SCAN_SCRIPT = path.join(process.cwd(), "scripts", "frame-scan.sh");
const AI_USER_ID = "ai-reviewer";
const AI_USER_NAME = "AI 검수";
const SCAN_TIMEOUT_MS = 15 * 60 * 1000;

type ScanIssue = {
  timeSec: number;
  startSec?: number;
  endSec?: number;
  bbox: { x: number; y: number; w: number; h: number };
  fullText?: string;
  wrong?: string;
  correct?: string;
  original?: string;
  issue: string;
  suggestion: string;
};
type ScanResult = {
  subtitles: unknown[];
  issues: ScanIssue[];
};

// POST /api/videos/scan  body: { path: "/foo.mp4" }
// → { jobId: string }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 검수 실행에 필요한 binary 가 prod 에 누락된 경우 fail-fast (exit 127 같은 silent 사고 방지)
  try {
    requireBins(["ffmpeg", "ffprobe", "ocr", "claude"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "deps missing" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const rawPath = body?.path;
  if (!rawPath || typeof rawPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const filePath = rawPath.normalize("NFC");

  if (!(await canAccessFile(session, filePath))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 이미 실행 중이면 해당 job 반환
  const existing = listRunningJobsForPath(filePath);
  if (existing.length > 0) {
    return NextResponse.json({ jobId: existing[0].id, existing: true });
  }

  let absVideo: string;
  try {
    absVideo = resolveSafePath(filePath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "invalid path";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    await fs.access(absVideo);
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const job = createScanJob(filePath);
  const outFile = path.join(
    process.env.TMPDIR || "/tmp",
    `vibox-scan-${job.id}.json`,
  );

  // 히스토리 시작 레코드
  await db.insert(scanHistory).values({
    id: job.id,
    filePath,
    startedBy: session.sub,
    startedByName: session.name ?? session.username,
    status: "running",
  });

  // 비동기 실행 (응답은 즉시)
  void runScanAsync(job.id, absVideo, outFile, filePath);

  return NextResponse.json({ jobId: job.id });
}

// GET /api/videos/scan?jobId=X  → { id, status, stage, progress, ... }
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const job = getScanJob(jobId);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicView(job));
}

// DELETE /api/videos/scan?jobId=X  → 취소
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const ok = cancelScanJob(jobId);
  if (!ok) return NextResponse.json({ error: "cannot cancel" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

async function runScanAsync(
  jobId: string,
  absVideo: string,
  outFile: string,
  filePath: string,
) {
  const job = getScanJob(jobId);
  if (!job) return;

  // 디버그 — 매 스캔의 stdout/stderr 전체를 파일로 보존 (원인 진단용)
  const debugLogPath = path.join(
    process.env.HOME || "/tmp",
    "vibox",
    "logs",
    `scan-${jobId}.log`,
  );
  await fs.mkdir(path.dirname(debugLogPath), { recursive: true }).catch(() => {});
  const debugLog = await fs.open(debugLogPath, "a").catch(() => null);
  const writeDebug = async (label: string, text: string) => {
    if (!debugLog) return;
    try {
      await debugLog.write(`[${new Date().toISOString()}] ${label}: ${text}`);
    } catch {}
  };
  await writeDebug("INFO", `start scan video=${absVideo} out=${outFile}\n`);

  const proc = spawn(SCAN_SCRIPT, [absVideo, outFile], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CLAUDECODE: "" },
  });
  bindProcess(job, proc, outFile);

  let stderr = "";
  const timer = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {}
  }, SCAN_TIMEOUT_MS);

  proc.stdout.on("data", (d: Buffer) => {
    const text = d.toString();
    void writeDebug("OUT", text);
    const result = parseStageFromOutput(text);
    if (result) updateProgress(job, result);
  });
  proc.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
    const text = d.toString();
    void writeDebug("ERR", text);
    const result = parseStageFromOutput(text);
    if (result) updateProgress(job, result);
  });

  proc.on("error", (err: Error) => {
    clearTimeout(timer);
    void writeDebug("PROCERR", err.message + "\n");
    markFailed(job, err.message);
  });

  proc.on("exit", async (code) => {
    clearTimeout(timer);
    void writeDebug("EXIT", `code=${code}\n`);
    await debugLog?.close().catch(() => {});
    if (job.status === "cancelled") {
      fs.rm(outFile, { force: true }).catch(() => {});
      await db
        .update(scanHistory)
        .set({ status: "cancelled", finishedAt: new Date() })
        .where(eq(scanHistory.id, job.id))
        .catch(() => {});
      return;
    }
    if (code !== 0) {
      const errSnippet = stderr.slice(-1200);
      markFailed(job, `exit ${code}: ${errSnippet}`);
      fs.rm(outFile, { force: true }).catch(() => {});
      await db
        .update(scanHistory)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: `exit ${code}: ${errSnippet}`,
        })
        .where(eq(scanHistory.id, job.id))
        .catch(() => {});
      return;
    }
    try {
      const raw = await fs.readFile(outFile, "utf-8");
      const result = JSON.parse(raw) as ScanResult;

      // 기존 AI 댓글 삭제 + 새 이슈 INSERT 를 트랜잭션으로 묶어 중간 실패·동시 scan race 차단.
      // 트랜잭션 안에서 던지면 자동 롤백 → 클라이언트는 일관된 상태만 봄.
      let inserted = 0;
      await db.transaction(async (tx) => {
        await tx
          .delete(comments)
          .where(
            and(
              eq(comments.filePath, filePath),
              eq(comments.authorId, AI_USER_ID),
            ),
          );

        for (const iss of result.issues ?? []) {
          try {
            const startSec =
              typeof iss.startSec === "number" ? iss.startSec : iss.timeSec;
            const endSec =
              typeof iss.endSec === "number" ? iss.endSec : iss.timeSec;
            const wrong = (iss.wrong || iss.original || "").trim().slice(0, 200);
            const correct = (iss.correct || iss.suggestion || "").trim();
            const annotation = serializeAnnotation({
              bbox: iss.bbox,
              original: wrong,
              suggestion: correct,
              note: iss.issue,
              startMs: Math.max(0, Math.floor(startSec * 1000)),
              endMs: Math.max(0, Math.floor(endSec * 1000)),
            });
            await tx.insert(comments).values({
              id: randomUUID(),
              filePath,
              authorId: AI_USER_ID,
              authorName: AI_USER_NAME,
              videoTimeMs: Math.max(0, Math.floor(startSec * 1000)),
              category: "txt",
              autoCategory: "txt",
              kind: "feedback",
              autoKind: "feedback",
              annotation,
              body: `"${wrong}" → "${correct}" · ${iss.issue}`,
            });
            inserted++;
          } catch {
            // 개별 이슈 직렬화 실패는 skip — 트랜잭션은 유지 (전체 롤백 안 함)
          }
        }
      });
      // 프레임 검수는 일시 보류 (2026-05-26) — 자막 오타만 우선 검수
      // 복구하려면 아래 두 줄 주석 해제 + markDone(job, inserted) 를 totalInserted 로 교체
      // const frameInserted = await runFrameScan(absVideo, filePath).catch(() => 0);
      // const totalInserted = inserted + frameInserted;

      markDone(job, inserted);
      await db
        .update(scanHistory)
        .set({
          status: "done",
          finishedAt: new Date(),
          issuesFound: inserted,
        })
        .where(eq(scanHistory.id, job.id))
        .catch(() => {});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "parse error";
      markFailed(job, msg);
      await db
        .update(scanHistory)
        .set({ status: "failed", finishedAt: new Date(), error: msg })
        .where(eq(scanHistory.id, job.id))
        .catch(() => {});
    } finally {
      fs.rm(outFile, { force: true }).catch(() => {});
    }
  });
}

// 프레임 검수 (블랙/정지) 실행 후 cut 카테고리 댓글로 저장
async function runFrameScan(absVideo: string, filePath: string): Promise<number> {
  const outFile = path.join(
    process.env.TMPDIR || "/tmp",
    `vibox-frame-${randomUUID()}.json`,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FRAME_SCAN_SCRIPT, [absVideo, outFile], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(() => proc.kill("SIGKILL"), 5 * 60 * 1000);
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`frame-scan exit ${code}: ${err.slice(0, 200)}`));
      });
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    const raw = await fs.readFile(outFile, "utf-8");
    const data = JSON.parse(raw) as {
      issues: Array<{
        type: string;
        startSec: number;
        endSec: number;
        duration: number;
        title: string;
      }>;
    };

    let inserted = 0;
    for (const iss of data.issues ?? []) {
      try {
        const icon = iss.type === "black" ? "⚫" : "🧊";
        const body = `${icon} ${iss.title} (${iss.startSec.toFixed(1)}~${iss.endSec.toFixed(1)}s)`;
        await db.insert(comments).values({
          id: randomUUID(),
          filePath,
          authorId: AI_USER_ID,
          authorName: AI_USER_NAME,
          videoTimeMs: Math.max(0, Math.floor(iss.startSec * 1000)),
          category: "cut",
          autoCategory: "cut",
          kind: "feedback",
          autoKind: "feedback",
          body,
        });
        inserted++;
      } catch {}
    }
    return inserted;
  } finally {
    fs.rm(outFile, { force: true }).catch(() => {});
  }
}

export const runtime = "nodejs";
export const maxDuration = 900;
