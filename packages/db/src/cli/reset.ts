import { loadDotenv } from "@shorts-os/config/dotenv";
import postgres from "postgres";

loadDotenv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL이 필요합니다.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("production에서는 실행할 수 없습니다.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1, onnotice: () => {} });
await client.unsafe(`
  drop schema if exists public cascade;
  create schema public;
  drop schema if exists auth cascade;
`);
await client.end({ timeout: 5 });
console.log("public/auth 스키마를 비웠습니다. 이어서 db:migrate를 실행하세요.");
