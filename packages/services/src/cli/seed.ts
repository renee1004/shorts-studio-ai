import { loadDotenv } from "@shorts-os/config/dotenv";
import { closePools, serviceDb } from "@shorts-os/db";
import { seedDemoWorkspace } from "../seed";

loadDotenv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL이 필요합니다.");
  process.exit(1);
}

const db = serviceDb(connectionString);

try {
  const result = await seedDemoWorkspace(db);
  console.log(`Demo 워크스페이스: ${result.workspaceId}`);
  console.log(`Demo 사용자: ${result.userId}`);
  for (const niche of result.niches) {
    console.log(`  - ${niche.name}: 영상 ${niche.videos}편, 새 주제 ${niche.topicsCreated}개`);
  }
} finally {
  await closePools();
}
