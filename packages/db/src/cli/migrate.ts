import { loadDotenv } from "@shorts-os/config";
import { runMigrations } from "../migrate";

loadDotenv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL이 필요합니다. .env.example을 참고하세요.");
  process.exit(1);
}

const results = await runMigrations({
  connectionString,
  log: (message) => console.log(message),
});

const applied = results.filter((r) => r.applied);
const skipped = results.filter((r) => !r.applied);

console.log(`\n적용 ${applied.length}건, 건너뜀 ${skipped.length}건`);
for (const item of skipped) {
  console.log(`  - ${item.file}: ${item.skippedReason}`);
}
process.exit(0);
