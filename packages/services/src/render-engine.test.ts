import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeRender,
  ffmpegAvailable,
  writePlaceholderClip,
} from "./render-engine";
import { RENDER_ENGINE_VERSION, RENDER_MANIFEST_VERSION } from "@shorts-os/contracts";

const prevRoot = process.env.MEDIA_ROOT;

afterEach(() => {
  if (prevRoot === undefined) delete process.env.MEDIA_ROOT;
  else process.env.MEDIA_ROOT = prevRoot;
});

describe("FFmpeg fixture render", () => {
  it("단색 클립을 이어 붙이고 checksum을 남긴다", async () => {
    if (!(await ffmpegAvailable())) {
      return;
    }

    const root = await mkdtemp(path.join(os.tmpdir(), "shorts-render-"));
    process.env.MEDIA_ROOT = root;
    const workspaceId = "00000000-0000-4000-8000-0000000000aa";
    const renderId = "00000000-0000-4000-8000-0000000000bb";
    const clipA = path.join(root, "a.mp4");
    const clipB = path.join(root, "b.mp4");

    await writePlaceholderClip({
      outputPath: clipA,
      durationSeconds: 0.4,
      width: 360,
      height: 640,
      fps: 24,
      colorIndex: 0,
    });
    await writePlaceholderClip({
      outputPath: clipB,
      durationSeconds: 0.4,
      width: 360,
      height: 640,
      fps: 24,
      colorIndex: 1,
    });

    const result = await composeRender({
      renderId,
      workspaceId,
      clipPaths: [clipA, clipB],
      manifest: {
        version: RENDER_MANIFEST_VERSION,
        engine: RENDER_ENGINE_VERSION,
        width: 360,
        height: 640,
        fps: 24,
        scriptId: "00000000-0000-4000-8000-0000000000cc",
        captionsInPost: true,
        allowPlaceholder: true,
        voiceAssetId: null,
        musicAssetId: null,
        retryOf: null,
        shots: [
          {
            shotId: "00000000-0000-4000-8000-0000000000d1",
            sequenceNo: 1,
            startSeconds: 0,
            endSeconds: 0.4,
            durationSeconds: 0.4,
            narration: "하나",
            onScreenText: "Hook",
            visualDescription: "card",
            strategy: "placeholder",
            clipAssetId: null,
            clipChecksum: null,
          },
          {
            shotId: "00000000-0000-4000-8000-0000000000d2",
            sequenceNo: 2,
            startSeconds: 0.4,
            endSeconds: 0.8,
            durationSeconds: 0.4,
            narration: "둘",
            onScreenText: "Body",
            visualDescription: "card",
            strategy: "placeholder",
            clipAssetId: null,
            clipChecksum: null,
          },
        ],
      },
    });

    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.width).toBe(360);
    expect(result.height).toBe(640);
    expect(result.durationSeconds).toBeGreaterThan(0.5);
    expect(result.probe).toMatchObject({ captionsInPost: true });

    await rm(root, { recursive: true, force: true });
  }, 60_000);
});
