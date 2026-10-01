import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@shorts-os/domain";
import { GET, POST } from "../app/api/v1/workspaces/[workspaceId]/gemini-image/route";
const mocks = vi.hoisted(() => ({ context: vi.fn(), check: vi.fn(), generate: vi.fn(), role: vi.fn(), env: vi.fn() }));
vi.mock("@/server/context", () => ({ workspaceContext: mocks.context }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@shorts-os/services", () => ({ generateShotImage: mocks.generate }));
vi.mock("@shorts-os/providers", () => ({ GeminiImageProvider: class { checkConnection() { return mocks.check(); } } }));
const workspaceId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const shotId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ workspaceId }) };
function post(body: unknown) { return POST(new Request("http://localhost/image", { method: "POST", body: JSON.stringify(body) }), params); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockReset();
  mocks.env.mockReturnValue({ APP_MODE: "live", GEMINI_API_KEY: "PRIVATE_KEY", GEMINI_IMAGE_MODEL: "gemini-3.1-flash-lite-image" });
  mocks.context.mockResolvedValue({ run: async (fn: (arg: unknown) => unknown) => fn({ db: "scoped-db", user: { id: "user" }, requireRole: mocks.role }) });
  mocks.check.mockResolvedValue({ model: "gemini-3.1-flash-lite-image", message: "metadata only" });
  mocks.generate.mockResolvedValue({ assetId: "asset", reused: false });
});
describe("Gemini image HTTP boundary", () => {
  it("connection check does not generate and never returns the key", async () => {
    const response = await GET(new Request("http://localhost/image"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("PRIVATE_KEY");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("requires explicit paid action", async () => {
    expect((await post({ projectId, shotId })).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("denies read-only users before checking Google or generating", async () => {
    mocks.role.mockImplementation(() => { throw new DomainError("PERMISSION_DENIED", "denied"); });
    expect((await GET(new Request("http://localhost/image"), params)).status).toBe(403);
    expect((await post({ projectId, shotId, confirmPaid: true })).status).toBe(403);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("uses the authenticated workspace and server model", async () => {
    expect((await post({ projectId, shotId, confirmPaid: true, model: "forged" })).status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ db: "scoped-db", workspaceId, projectId, shotId, userId: "user", model: "gemini-3.1-flash-lite-image" }));
  });
});
