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
    // 같은 Idempotency Key는 기존 Run을 재사용하므로 0편으로 보인다. 실패가 아니다.
    console.log(
      niche.reused
        ? `  - ${niche.name}: 이미 시드되어 있어 건너뛰었습니다`
        : `  - ${niche.name}: 영상 ${niche.videos}편, 새 주제 ${niche.topicsCreated}개`,
    );
  }
} finally {
  await closePools();
}
