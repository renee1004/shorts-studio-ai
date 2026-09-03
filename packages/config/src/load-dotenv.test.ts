import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenv } from "./load-dotenv";

const previous = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
});

describe("loadDotenv", () => {
  it("파일이 있으면 비어 있는 변수만 채운다", () => {
    const dir = mkdtempSync(join(tmpdir(), "shorts-os-env-"));
    writeFileSync(join(dir, ".env"), "DOTENV_TEST_A=from-file\nDOTENV_TEST_B=keep-me\n");
    process.env.DOTENV_TEST_B = "already-set";

    const loaded = loadDotenv(dir);

    expect(loaded).toContain(join(dir, ".env"));
    expect(process.env.DOTENV_TEST_A).toBe("from-file");
    expect(process.env.DOTENV_TEST_B).toBe("already-set");
  });
});
