import { loadDotenv } from "@shorts-os/config/dotenv";

// 통합 테스트도 CLI와 같은 방식으로 .env를 읽는다. 셸에 DATABASE_URL을 내보내지 않아도 된다.
loadDotenv();
