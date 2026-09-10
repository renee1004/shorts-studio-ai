import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}
run(["db:migrate"]);
if (process.env.APP_MODE === "demo" && process.env.AUTH_PROVIDER === "demo")
  run(["db:seed"]);
