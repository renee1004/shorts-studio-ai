import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    include: ["src/integration/**/*.test.ts"],
    setupFiles: [resolve("./vitest.integration.setup.ts")],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@shorts-os/config/dotenv": resolve("../config/src/load-dotenv.ts"),
      "@shorts-os/config": resolve("../config/src/index.ts"),
      "@shorts-os/contracts": resolve("../contracts/src/index.ts"),
      "@shorts-os/db": resolve("../db/src/index.ts"),
      "@shorts-os/domain": resolve("../domain/src/index.ts"),
      "@shorts-os/observability": resolve("../observability/src/index.ts"),
      "@shorts-os/providers": resolve("../providers/src/index.ts"),
      "@shorts-os/services": resolve("./src/index.ts"),
    },
  },
});
