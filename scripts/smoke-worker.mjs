import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const port = "43129";
const child = spawn(process.execPath, ["apps/worker/dist/server.js"], {
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (data) => {
  logs += data;
});
child.stderr.on("data", (data) => {
  logs += data;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    assert.equal(child.exitCode, null, `Worker exited at startup: ${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Worker never became ready: ${logs}`);
  const rejected = await fetch(`http://127.0.0.1:${port}/internal/render`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(rejected.status, 401);
  const malformed = await fetch(`http://127.0.0.1:${port}/internal/render`, {
    method: "POST",
    headers: {
      "x-worker-secret":
        process.env.WORKER_SHARED_SECRET ?? "demo-worker-secret-change-me",
    },
    body: "invalid-json",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  console.log(
    "Production Worker health, auth and malformed request checks passed",
  );
} finally {
  child.kill("SIGTERM");
}
