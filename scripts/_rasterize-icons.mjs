import sharp from "sharp";
import fs from "node:fs/promises";

// logo.png 를 흰 배경에 합성해 PWA 아이콘 5종 생성.
// - any purpose: 92% 영역 (시각적 padding 살짝)
// - maskable: 70% 영역 (Android 가장자리 절단 대비 safe-zone)
// 1회용 — 로고 변경 시 재실행 후 commit.

const logo = await fs.readFile("public/logo.png");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function makeIcon(size, contentPct, outPath) {
  const inner = Math.round(size * contentPct);
  const fg = await sharp(logo)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: fg, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}×${size}, content ${Math.round(contentPct * 100)}%)`);
}

await makeIcon(192, 0.92, "public/icon-192.png");
await makeIcon(512, 0.92, "public/icon-512.png");
await makeIcon(192, 0.70, "public/icon-maskable-192.png");
await makeIcon(512, 0.70, "public/icon-maskable-512.png");
await makeIcon(180, 0.92, "public/apple-touch-icon.png");
