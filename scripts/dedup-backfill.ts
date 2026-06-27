#!/usr/bin/env tsx
/**
 * dedup 백필 (파일시스템 기반) — zone 루트(Shared/Personal/Library/Notes)를 직접 걸어
 * 내용이 완전히 같은 파일(SHA256+크기)을 하드링크로 병합, 디스크 1벌만 남긴다.
 * + fileUploads 행(디스크에 존재하는 것)의 content_hash/file_size 도 백필(미래 업로드 dedup용).
 *
 * 왜 FS 기반인가: 다운로드가 경로 직접 방식이고, 기존 중복(예: 렌더 재저장본)이 fileUploads 에
 * 없는 경우가 많아 DB 기반으론 못 잡는다. FS 를 직접 걸어야 실제 중복을 모두 회수한다.
 *
 * 사용법:
 *   tsx scripts/dedup-backfill.ts            # dry-run (무엇이 합쳐질지·절약량만, 무변경)
 *   tsx scripts/dedup-backfill.ts --apply    # 하드링크 병합 + DB content_hash 백필 실행
 *
 * ⚠️ 8TB(STORAGE_ROOT)·prod DB 가 있는 M2 에서 실행. 안전: "삭제"가 아니라 "하드링크"라 데이터 보존.
 *    같은-볼륨 검사 + 원자적 rename(tmp→target) + 실패 시 무변경. 그룹당 1벌은 항상 남긴다.
 *    .vibox(uploads/trash/hls 내부 디렉터리)는 제외 — 라이브 사용자 파일만 대상.
 */
import "./_loadenv";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { getZoneRoot, resolveSafePath } from "../lib/fs/storage";
import { db } from "../lib/db/client";
import { fileUploads } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { formatBytes } from "../lib/reconcile";

async function hashFile(abs: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const r = createReadStream(abs);
    r.on("data", (c) => h.update(c));
    r.once("end", () => resolve());
    r.once("error", reject);
  });
  return h.digest("hex");
}

type Rec = { abs: string; size: number; dev: number; ino: number; hash?: string };

async function walk(dir: string, out: Rec[]) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".vibox" || e.name === ".DS_Store") continue; // 내부 디렉터리·메타 제외
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, out);
    } else if (e.isFile() && !e.name.startsWith(".")) {
      try {
        const st = await fs.stat(p);
        if (st.isFile() && st.size > 0)
          out.push({ abs: p, size: st.size, dev: st.dev, ino: st.ino });
      } catch {
        /* skip */
      }
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`▸ Vibox dedup 백필 (FS 기반) ${apply ? "(적용 모드)" : "(드라이런)"}`);

  // 1) zone 루트 수집 (중복 경로 제거)
  const roots = [
    ...new Set([
      getZoneRoot("rendering"),
      getZoneRoot("personal"),
      getZoneRoot("library"),
      getZoneRoot("notes"),
    ]),
  ];
  const files: Rec[] = [];
  for (const r of roots) await walk(r, files);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  console.log(`  대상 파일: ${files.length}개 (${formatBytes(totalBytes)})`);

  // 2) 크기 그룹 → 같은 크기만 해시 (속도)
  const bySize = new Map<number, Rec[]>();
  for (const f of files) {
    const arr = bySize.get(f.size);
    if (arr) arr.push(f);
    else bySize.set(f.size, [f]);
  }
  const absHash = new Map<string, string>(); // abs → hash (DB 백필 재사용)
  const byHash = new Map<string, Rec[]>(); // "size:hash" → recs
  for (const [size, list] of bySize) {
    if (list.length < 2) continue;
    for (const f of list) {
      const h = await hashFile(f.abs);
      f.hash = h;
      absHash.set(f.abs, h);
      const key = `${size}:${h}`;
      const arr = byHash.get(key);
      if (arr) arr.push(f);
      else byHash.set(key, [f]);
    }
  }

  // 3) 동일 그룹 → 1벌 남기고 하드링크 병합
  let dupGroups = 0;
  let reclaim = 0;
  let merged = 0;
  for (const list of byHash.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.abs.localeCompare(b.abs));
    const canonical = list[0];
    let groupHasDup = false;
    for (const r of list.slice(1)) {
      if (r.dev === canonical.dev && r.ino === canonical.ino) continue; // 이미 하드링크됨
      if (r.dev !== canonical.dev) continue; // 다른 볼륨 → 불가
      groupHasDup = true;
      reclaim += r.size;
      console.log(`   ${formatBytes(r.size)} 중복: ${r.abs}  →  ${canonical.abs}`);
      if (apply) {
        const tmp = `${r.abs}.dedup-${randomUUID()}.tmp`;
        try {
          await fs.link(canonical.abs, tmp);
          await fs.rename(tmp, r.abs);
          merged++;
        } catch {
          await fs.rm(tmp, { force: true }).catch(() => {});
        }
      }
    }
    if (groupHasDup) dupGroups++;
  }
  console.log(
    `\n  중복 그룹 ${dupGroups}개 · ${apply ? `하드링크 병합 ${merged}개 · ` : ""}회수 ${apply ? "" : "가능 "}${formatBytes(reclaim)}`,
  );

  // 4) DB content_hash 백필 (fileUploads 행 중 디스크에 존재하는 것 — 미래 업로드 dedup용)
  if (apply) {
    const rows = await db.select({ path: fileUploads.path }).from(fileUploads);
    let updated = 0;
    for (const row of rows) {
      let abs: string;
      try {
        abs = resolveSafePath(row.path);
      } catch {
        continue;
      }
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        continue; // 고아 행 (reconcile 대상)
      }
      if (!st.isFile()) continue;
      const h = absHash.get(abs) ?? (await hashFile(abs));
      await db
        .update(fileUploads)
        .set({ contentHash: h, fileSize: st.size })
        .where(eq(fileUploads.path, row.path));
      updated++;
    }
    console.log(`  DB content_hash 백필: ${updated}행`);
  } else {
    console.log("  (드라이런 — 무변경. 실제 적용은 `--apply`)");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
