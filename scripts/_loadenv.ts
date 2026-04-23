// 다른 모듈보다 먼저 임포트해서 .env.local / .env 를 process.env 로 주입
// (db/client.ts 등이 module load 시점에 process.env를 읽기 때문)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
