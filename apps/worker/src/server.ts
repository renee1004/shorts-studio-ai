/**
 * Cloud Run Worker 골격. Phase 4 Video Factory에서 실제 작업을 받는다.
 * 지금은 프로세스만 살아 있고 작업을 수락하지 않는다.
 */
import { createLogger } from "@shorts-os/observability";

const log = createLogger();

const port = Number.parseInt(process.env.PORT ?? "43118", 10);

log.info({ port }, "Worker skeleton. Video jobs are not enabled until Phase 4.");

process.on("SIGTERM", () => {
  log.info("SIGTERM");
  process.exit(0);
});
