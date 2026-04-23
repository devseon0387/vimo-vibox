import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";

// macOS Vision OCR 바이너리 경로 (repo 내부)
const OCR_BIN =
  process.env.OCR_BIN_PATH ||
  path.join(process.cwd(), "scripts", "ocr");
const OCR_TIMEOUT_MS = 8_000;

// POST /api/ocr  body: { imageBase64: string }
// → { text: string, ms: number }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // OCR 은 CPU 무거워 내부팀만 (파트너/게스트 접근 차단)
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.imageBase64) {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }

  const b64 = String(body.imageBase64).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid image size" }, { status: 400 });
  }

  const tmpDir = path.join(process.env.TMPDIR || "/tmp", "vibox-ocr");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${randomUUID()}.jpg`);
  await fs.writeFile(tmpFile, buf);

  const start = Date.now();
  try {
    const text = await runVisionOCR(tmpFile);
    return NextResponse.json({ text, ms: Date.now() - start });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg, text: "" }, { status: 500 });
  } finally {
    fs.rm(tmpFile, { force: true }).catch(() => {});
  }
}

function runVisionOCR(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(OCR_BIN, [imagePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ocr timeout"));
    }, OCR_TIMEOUT_MS);

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      // code 0 = success (including empty text), other = error
      if (code !== 0) {
        reject(new Error(`ocr exit ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export const runtime = "nodejs";
