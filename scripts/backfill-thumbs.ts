/**
 * 기존에 업로드된 영상들에 대해 썸네일을 일괄 생성.
 * 사용: npx tsx scripts/backfill-thumbs.ts
 *
 * 운영 실행 (아이맥):
 *   ssh vimo-imac 'export PATH=/usr/local/bin:/usr/local/Cellar/node/25.6.1/bin:$PATH \
 *     && cd /Users/vimo/vimo-cloud \
 *     && npx tsx scripts/backfill-thumbs.ts'
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { getStorageRoot } from "../lib/fs/storage";
import {
  isVideoPath,
  hasThumb,
  generateThumb,
} from "../lib/fs/thumbnail";

async function walk(absDir: string, relDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 숨김(.vibox/ 등) 건너뜀
    const childAbs = path.join(absDir, e.name);
    const childRel = path.posix.join(relDir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(childAbs, childRel)));
    } else if (e.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

async function main() {
  const root = getStorageRoot();
  console.log(`▸ Scanning ${root}...`);
  const allFiles = await walk(root, "/");
  const videos = allFiles.filter(isVideoPath);
  console.log(`  ${allFiles.length} files, ${videos.length} videos`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const prefix = `[${i + 1}/${videos.length}]`;
    if (await hasThumb(v)) {
      skipped++;
      console.log(`${prefix} skip (exists): ${v}`);
      continue;
    }
    process.stdout.write(`${prefix} gen: ${v} ... `);
    const ok = await generateThumb(v);
    if (ok) {
      generated++;
      console.log("✓");
    } else {
      failed++;
      console.log("✗");
    }
  }

  console.log("");
  console.log(`✓ backfill complete: ${generated} generated, ${skipped} skipped, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
