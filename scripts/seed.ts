import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { db } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("\n=== Vibox 사용자 생성 ===\n");

  const username = (await rl.question("사용자 ID (예: vimo): ")).trim().toLowerCase();
  if (!username) throw new Error("ID가 비어있습니다");

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing.length > 0) {
    const ans = await rl.question(
      `이미 존재하는 ID입니다. 비밀번호를 재설정할까요? (y/N): `,
    );
    if (ans.trim().toLowerCase() !== "y") {
      console.log("취소됨.");
      rl.close();
      return;
    }
  }

  const name = (await rl.question("이름 (선택): ")).trim() || username;
  const email = (await rl.question("이메일 (선택): ")).trim() || null;
  const password = await rl.question("비밀번호 (입력 중 보임 주의): ");
  if (password.length < 6) throw new Error("비밀번호는 6자 이상");

  const roleAns = (await rl.question("관리자? (Y/n): ")).trim().toLowerCase();
  const role = roleAns === "n" ? "member" : "admin";

  rl.close();

  const passwordHash = await bcrypt.hash(password, 10);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ passwordHash, name, email, role })
      .where(eq(users.username, username));
    console.log(`\n✓ 사용자 '${username}' 업데이트됨 (role=${role})\n`);
  } else {
    await db.insert(users).values({
      id: randomUUID(),
      username,
      name,
      email,
      passwordHash,
      role,
      quotaGb: 100,
    });
    console.log(`\n✓ 사용자 '${username}' 생성됨 (role=${role})\n`);
  }
}

main().catch((e) => {
  console.error("에러:", e.message);
  process.exit(1);
});
