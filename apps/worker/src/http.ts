import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "@shorts-os/observability";
import { executeRenderJob, ffmpegAvailable } from "@shorts-os/services";

const log = createLogger({ provider: "ffmpeg" });
const port = Number.parseInt(process.env.PORT ?? "43118", 10);
const secret =
  process.env.WORKER_SHARED_SECRET ?? "demo-worker-secret-change-me";

export async function workerHealth() {
  const ffmpeg = await ffmpegAvailable();
  return {
    ok: ffmpeg,
    service: "shorts-os-worker",
    ffmpeg,
    ffprobe: ffmpeg,
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4096) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function handleWorkerRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/health") {
    const body = await workerHealth();
    res.writeHead(body.ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/internal/render") {
    if (req.headers["x-worker-secret"] !== secret) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }
    const payload = (await readJson(req)) as { renderJobId?: string };
    if (
      typeof payload?.renderJobId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.renderJobId,
      )
    ) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "VALIDATION_FAILED" }));
      return;
    }
    res.writeHead(202, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ accepted: true, renderJobId: payload.renderJobId }),
    );
    void executeRenderJob(payload.renderJobId).catch((error) => {
      log.error({ err: String(error) }, "render failed");
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
}
