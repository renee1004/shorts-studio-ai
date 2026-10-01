import { describe, expect, it, vi } from "vitest";
import { creationRequest, CreationRequestUncertainError } from "../lib/creation-request";

describe("creation request transport", () => {
  it("bounds a hung request without submitting again", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise(() => {}));
    await expect(creationRequest("/prepare", {}, fetchImpl, 5)).rejects.toBeInstanceOf(CreationRequestUncertainError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it("treats a lost response as uncertain", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new TypeError("network"); });
    await expect(creationRequest("/prepare", {}, fetchImpl)).rejects.toBeInstanceOf(CreationRequestUncertainError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("returns saved data", async () => {
    await expect(creationRequest("/prepare", {}, async () => new Response(JSON.stringify({ data: { id: "saved" } })))).resolves.toEqual({ id: "saved" });
  });
  it("preserves a server rejection", async () => {
    await expect(creationRequest("/prepare", {}, async () => new Response(JSON.stringify({ error: { message: "진행 중" } }), { status: 409 }))).rejects.toThrow("진행 중");
  });
});
