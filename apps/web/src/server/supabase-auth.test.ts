import { describe, expect, it, vi } from "vitest";
import { SupabaseAuthClient } from "./supabase-auth";

const user = {
  id: "00000000-0000-4000-8000-000000000012",
  email: "member@example.com",
};
describe("Supabase authentication boundary", () => {
  it("verifies tokens with Auth and never trusts caller identity", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(user));
    const client = new SupabaseAuthClient(
      "https://auth.example",
      "anon",
      request,
    );
    expect(await client.readSession("token")).toEqual({
      ...user,
      provider: "supabase",
    });
    expect(request).toHaveBeenCalledWith(
      "https://auth.example/auth/v1/user",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
  it("rejects expired tokens", async () => {
    const client = new SupabaseAuthClient(
      "https://auth.example",
      "anon",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    );
    expect(await client.readSession("expired")).toBeNull();
  });
  it("does not contact Auth when signed out", async () => {
    const request = vi.fn<typeof fetch>();
    expect(
      await new SupabaseAuthClient(
        "https://auth.example",
        "anon",
        request,
      ).readSession(undefined),
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("validates the password grant response", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ access_token: "token", expires_in: 3600, user }),
      );
    expect(
      (
        await new SupabaseAuthClient(
          "https://auth.example",
          "anon",
          request,
        ).signIn(user.email, "password")
      ).user.id,
    ).toBe(user.id);
  });
  it("distinguishes invalid credentials from provider failures", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      new SupabaseAuthClient("https://auth.example", "anon", request).signIn(
        user.email,
        "wrong",
      ),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
  it("does not turn network failures into successful sessions", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    await expect(
      new SupabaseAuthClient(
        "https://auth.example",
        "anon",
        request,
      ).readSession("token"),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
