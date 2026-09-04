import { describe, expect, it } from "vitest";
import { workerHealth } from "./http";

describe("Cloud Run health check", () => {
  it("ffmpeg 유무를 숨기지 않는다", async () => {
    const body = await workerHealth();
    expect(body.service).toBe("shorts-os-worker");
    expect(typeof body.ffmpeg).toBe("boolean");
    expect(body.ok).toBe(body.ffmpeg);
  });
});
