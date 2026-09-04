/**
 * Cloud Run Video Factory Worker. GET /health, POST /internal/render
 */
import { createServer } from "node:http";
import { createLogger } from "@shorts-os/observability";
import { loadDotenv } from "@shorts-os/config/dotenv";
import { handleWorkerRequest } from "./http";

loadDotenv();

const log = createLogger({ provider: "ffmpeg" });
const port = Number.parseInt(process.env.PORT ?? "43118", 10);

const server = createServer((req, res) => {
  void handleWorkerRequest(req, res);
});

server.listen(port, "0.0.0.0", () => {
  log.info({ port }, "Video Factory worker listening");
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
