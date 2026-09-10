import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** 패키지들이 소스를 직접 참조하므로 alias를 한곳에서 맞춘다. */
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/worker/src/**/*.test.ts", "apps/web/src/server/**/*.test.ts"],
    exclude: ["**/integration/**", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@shorts-os/config": resolve("./packages/config/src/index.ts"),
      "@shorts-os/contracts": resolve("./packages/contracts/src/index.ts"),
      "@shorts-os/db": resolve("./packages/db/src/index.ts"),
      "@shorts-os/domain": resolve("./packages/domain/src/index.ts"),
      "@shorts-os/observability": resolve("./packages/observability/src/index.ts"),
      "@shorts-os/providers": resolve("./packages/providers/src/index.ts"),
      "@shorts-os/services": resolve("./packages/services/src/index.ts"),
    },
  },
});
