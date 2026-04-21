import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveSafePath } from "@/lib/fs/storage";

const SCAN_SCRIPT = path.join(process.cwd(), "scripts", "frame-scan.sh");
const AI_USER_ID = "ai-reviewer";
const AI_USER_NAME = "AI 검수";
const SCAN_TIMEOUT_MS = 10 * 60 * 1000;

type FrameIssue = {
  type: "black" | "freeze";
  startSec: number;
  endSec: number;
  duration: number;
  severity: "medium" | "high";
  title: string;
  desc: string;
};
type ScanResult = {
  issues: FrameIssue[];
};

// POST /api/videos/frame-scan  body: { path: "/foo.mp4" }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const filePath = body?.path;
  if (!filePath || typeof filePath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
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

  const outFile = path.join(
    process.env.TMPDIR || "/tmp",
    `vibox-frame-${randomUUID()}.json`,
  );

  try {
    await runScan(absVideo, outFile);
    const raw = await fs.readFile(outFile, "utf-8");
    const result = JSON.parse(raw) as ScanResult;

    // 기존 cut 카테고리 AI 댓글 삭제 (재실행 시 중복 방지)
    // — txt(자막) AI 댓글은 그대로 둠
    await db
      .delete(comments)
      .where(
        and(
          eq(comments.filePath, filePath),
          eq(comments.authorId, AI_USER_ID),
          eq(comments.category, "cut"),
        ),
      );

    let inserted = 0;
    for (const iss of result.issues ?? []) {
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
      } catch {
        // skip
      }
    }

    return NextResponse.json({
      issues: result.issues.length,
      inserted,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    fs.rm(outFile, { force: true }).catch(() => {});
  }
}

function runScan(video: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SCAN_SCRIPT, [video, outFile], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("scan timeout"));
    }, SCAN_TIMEOUT_MS);

    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`scan exit ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

export const runtime = "nodejs";
export const maxDuration = 600;
