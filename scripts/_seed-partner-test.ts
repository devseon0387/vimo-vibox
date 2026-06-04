/**
 * 로컬 dev 전용 — 파트너 홈 시각 확인용 테스트 계정 + 더미 파일 시드.
 * 운영 DB와 무관(로컬 _data/vibox.db). 확인 후 삭제해도 됨.
 *   실행: npx tsx scripts/_seed-partner-test.ts
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });
config();

async function main() {
  const { db } = await import("../lib/db/client");
  const { users, fileUploads, comments } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const username = "partner-test";
  const password = "partner1234";
  const name = "윤현지(테스트)";
  const hash = await bcrypt.hash(password, 10);

  // 파트너 계정 (있으면 갱신)
  const found = await db.select().from(users).where(eq(users.username, username)).limit(1);
  let pid: string;
  if (found.length > 0) {
    pid = found[0].id;
    await db.update(users).set({ passwordHash: hash, role: "partner", quotaGb: 30, name }).where(eq(users.id, pid));
  } else {
    pid = randomUUID();
    await db.insert(users).values({ id: pid, username, name, email: null, passwordHash: hash, role: "partner", quotaGb: 30 });
  }

  // 매니저(코멘트 author용) — admin 우선
  const mgrRows = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const mgrId = mgrRows[0]?.id ?? pid;
  const mgrName = mgrRows[0]?.name ?? "매니저";

  const now = Date.now();
  const D = 86_400_000;
  const H = 3_600_000;

  // 더미 파일 (space는 path로 판별: /personal/{pid}/=개인, 그 외=비모)
  const files: { path: string; at: number }[] = [
    { path: "/team/브랜드필름_v3.mp4", at: now - 3 * D },   // 수정요청(코멘트가 더 늦음)
    { path: "/team/제품소개_최종.mov", at: now - 1 * D },   // 검수중(코멘트 없음)
    { path: "/team/인터뷰_김대표.mp4", at: now - 5 * D },   // 승인(approve 코멘트)
    { path: `/personal/${pid}/작업본_편집중.mp4`, at: now - 2 * H },
    { path: `/personal/${pid}/참고_레퍼런스.mov`, at: now - 1 * D },
  ];
  for (const f of files) {
    await db.insert(fileUploads).values({
      path: f.path,
      uploadedBy: pid,
      uploadedByName: name,
      uploadedAt: new Date(f.at),
    }).onConflictDoNothing();
  }

  // 매니저 코멘트 — 수정요청 2건 + 승인 1건
  const cmts: { filePath: string; kind: string; body: string; at: number }[] = [
    { filePath: "/team/브랜드필름_v3.mp4", kind: "feedback", body: "0:24 컷이 조금 길어요, 타이트하게", at: now - 2 * D },
    { filePath: "/team/브랜드필름_v3.mp4", kind: "feedback", body: "1:40 자막 오타 확인 부탁", at: now - 2 * D + H },
    { filePath: "/team/인터뷰_김대표.mp4", kind: "approve", body: "좋습니다. 승인합니다", at: now - 4 * D },
  ];
  for (const c of cmts) {
    await db.insert(comments).values({
      id: randomUUID(),
      filePath: c.filePath,
      authorId: mgrId,
      authorName: mgrName,
      videoTimeMs: 0,
      kind: c.kind,
      body: c.body,
      createdAt: new Date(c.at),
    }).onConflictDoNothing();
  }

  console.log("\n=== 파트너 테스트 계정 준비 완료 ===");
  console.log("  URL : http://localhost:3000/login");
  console.log("  ID  : partner-test");
  console.log("  PW  : partner1234");
  console.log("  role=partner, quota=30GB");
  console.log("  더미: 비모 납품 3건(수정요청 2·검수중·승인) + My box 2건");
  console.log("  (확인 후 정리: 이 계정/파일은 로컬 dev DB에만 있음)\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("시드 에러:", e);
  process.exit(1);
});
