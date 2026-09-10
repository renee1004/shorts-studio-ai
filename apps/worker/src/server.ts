/**
 * Cloud Run Video Factory Worker. GET /health, POST /internal/render
 */
import { createServer } from "node:http";
import { createLogger } from "@shorts-os/observability";
import { loadDotenv } from "@shorts-os/config/dotenv";
import { handleWorkerRequest } from "./http";
import { listQueuedRenderJobs, serviceDb } from "@shorts-os/db";
import { executeRenderJob } from "@shorts-os/services";

loadDotenv();

const log = createLogger({ provider: "ffmpeg" });
const port = Number.parseInt(process.env.PORT ?? "43118", 10);
let stopping = false;

// Queued jobs survive web dispatch/network failures in PostgreSQL.
async function drainQueue() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    const db = serviceDb(process.env.DATABASE_URL);
    for (const job of await listQueuedRenderJobs(db)) {
      if (stopping) break;
      try {
        await executeRenderJob(job.id, db);
      } catch {
        log.error({ renderJobId: job.id }, "queued render failed");
      }
    }
  } catch {
    log.error("render queue unavailable");
  }
  if (!stopping) setTimeout(() => void drainQueue(), 5000).unref();
}

const server = createServer((req, res) => {
  void handleWorkerRequest(req, res).catch(() => {
    if (!res.headersSent)
      res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "INVALID_REQUEST" }));
  });
});

server.listen(port, "0.0.0.0", () => {
  log.info({ port }, "Video Factory worker listening");
  void drainQueue();
});

process.on("SIGTERM", () => {
  stopping = true;
  server.close(() => process.exit(0));
});
