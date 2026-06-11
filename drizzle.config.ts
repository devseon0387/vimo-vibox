import type { Config } from "drizzle-kit";
import "dotenv/config";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    // 마이그레이션(DDL)은 직접 연결(5432). 런타임은 풀러(DATABASE_URL).
    url: process.env.DIRECT_URL!,
  },
} satisfies Config;
