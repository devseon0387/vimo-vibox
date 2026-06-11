// Baseon 이전: better-sqlite3 → PostgreSQL(postgres-js). 앱은 ORM(Drizzle)로만 접속.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 미설정 (Baseon 연결문자열)");

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// 싱글턴: Next dev/빌드 중 모듈 재평가 시 풀 재생성 방지
declare global {
  // eslint-disable-next-line no-var
  var __vimo_pg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __vimo_db: DrizzleDb | undefined;
}

function getClient() {
  if (global.__vimo_pg) return global.__vimo_pg;
  // PgBouncer(transaction)와 호환 위해 prepare:false
  const c = postgres(url!, { prepare: false });
  global.__vimo_pg = c;
  return c;
}

function getDb(): DrizzleDb {
  if (global.__vimo_db) return global.__vimo_db;
  const d = drizzle(getClient(), { schema });
  global.__vimo_db = d;
  return d;
}

export const db = getDb();
export { schema };
