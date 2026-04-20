// server-only 제거: seed 등 CLI 스크립트에서도 이 모듈을 import 해야 함.
// DB 코드는 better-sqlite3 (Node 네이티브)를 쓰므로 어차피 클라이언트 번들엔 포함 안 됨.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "_data", "vibox.db");

// 부모 디렉토리 보장
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// 싱글턴: Next.js 빌드/dev 중 모듈 재평가 시 DB 재오픈 방지 (SQLITE_BUSY 예방)
declare global {
  // eslint-disable-next-line no-var
  var __vimo_sqlite: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var __vimo_db: DrizzleDb | undefined;
}

function getSqlite(): Database.Database {
  if (global.__vimo_sqlite) return global.__vimo_sqlite;
  const s = new Database(dbPath);
  try {
    s.pragma("journal_mode = WAL");
  } catch {
    /* 다른 프로세스가 이미 설정해도 무시 */
  }
  try {
    s.pragma("foreign_keys = ON");
  } catch {}
  global.__vimo_sqlite = s;
  return s;
}

function getDb(): DrizzleDb {
  if (global.__vimo_db) return global.__vimo_db;
  const d = drizzle(getSqlite(), { schema });
  global.__vimo_db = d;
  return d;
}

export const db = getDb();
export { schema };
