import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadServerEnv } from "./env";

describe("deployment environment", () => {
  it("accepts the checked-in example including blank optional values", () => {
    const source = Object.fromEntries(
      readFileSync(new URL("../../../.env.example", import.meta.url), "utf8")
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    expect(loadServerEnv(source).SUPABASE_URL).toBeUndefined();
    expect(loadServerEnv(source).APP_MODE).toBe("demo");
  });
  it("does not permit the example session secret in production", () => {
    expect(() =>
      loadServerEnv({
        DATABASE_URL: "postgres://localhost/test",
        NODE_ENV: "production",
        AUTH_SESSION_SECRET: "change-me-to-a-long-random-string",
      }),
    ).toThrow(/AUTH_SESSION_SECRET/);
  });
  it("requires authenticated accounts for live operation", () => {
    expect(() =>
      loadServerEnv({
        DATABASE_URL: "postgres://localhost/test",
        APP_MODE: "live",
        YOUTUBE_API_KEY: "test",
      }),
    ).toThrow(/실제 계정/);
  });
});
