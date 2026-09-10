import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const check = spawnSync("docker", ["compose", "version"], { stdio: "inherit" });
if (check.error || check.status !== 0) {
  console.error("Docker Desktop을 설치하고 실행한 뒤 다시 시도해 주세요.");
  process.exit(1);
}
if (!existsSync(".env.docker")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env.docker",
    [
      "APP_MODE=demo",
      "AUTH_PROVIDER=demo",
      "DB_TARGET=local",
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://postgres:${password}@postgres:5432/shorts_os`,
      `DATABASE_APP_URL=postgresql://app_user:${randomBytes(24).toString("hex")}@postgres:5432/shorts_os`,
      `AUTH_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
      `WORKER_SHARED_SECRET=${randomBytes(32).toString("hex")}`,
      "WEB_BIND_ADDRESS=127.0.0.1",
      "WEB_PORT=43117",
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
}
const result = spawnSync(
  "docker",
  [
    "compose",
    "--env-file",
    ".env.docker",
    "-f",
    "compose.webapp.yml",
    "up",
    "--build",
    "-d",
    "--wait",
    "--wait-timeout",
    "180",
  ],
  { stdio: "inherit" },
);
if (result.error || result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "웹앱 준비 완료. 기본 주소: http://localhost:43117 (WEB_PORT 변경 시 해당 포트 사용)",
);
