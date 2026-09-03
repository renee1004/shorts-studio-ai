/**
 * npm install / yarn install을 막는다.
 * 이 저장소는 pnpm workspace라서 npm이 돌면 package-lock.json이 생기고
 * workspace:* 의존성을 해석하지 못한다.
 */
const agent = process.env.npm_config_user_agent ?? "";
const manager = agent.split("/")[0];

if (manager && manager !== "pnpm") {
  console.error(
    [
      "",
      `이 저장소는 pnpm을 씁니다. (${manager}로 실행됨)`,
      "",
      "  corepack enable",
      "  corepack prepare pnpm@10.33.3 --activate",
      "  pnpm install",
      "",
      "한 번에 실행하려면:  bash scripts/start-local.sh",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
