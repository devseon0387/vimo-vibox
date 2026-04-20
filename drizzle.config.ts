import type { Config } from "drizzle-kit";
import "dotenv/config";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./_data/vibox.db",
  },
} satisfies Config;
