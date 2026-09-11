import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/v1/workspaces/[workspaceId]/notebooklm/route";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), read: vi.fn(), save: vi.fn(), list: vi.fn(), get: vi.fn(),
  connection: vi.fn(), notebooks: vi.fn(), items: vi.fn(),
  logError: vi.fn(), logWarn: vi.fn(),
}));
vi.mock("@shorts-os/observability", () => ({ createLogger: () => ({ info: vi.fn(), warn: mocks.logWarn, error: mocks.logError }), newRequestId: () => "notebook-test" }));
vi.mock("@/server/context", () => ({ workspaceContext: mocks.context }));
vi.mock("@/server/notebooklm", () => ({ notebookConnection: mocks.connection, listRemoteNotebooks: mocks.notebooks, listRemoteItems: mocks.items, readRemoteItem: mocks.read }));
vi.mock("@shorts-os/services", () => ({ saveNotebookImport: mocks.save, listNotebookImports: mocks.list, getNotebookImport: mocks.get }));
const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ workspaceId }) };
const original = { notebookId: "00000000-0000-4000-8000-000000000003", itemId: "note-1", kind: "note", title: " 원문 ", text: " \r\n내용  \n" };
const contentHash = createHash("sha256").update(JSON.stringify([original.title, original.text])).digest("hex");
function context(provider = "supabase", role = "owner") {
  return { user: { id: userId, provider }, role, run: async (fn: (value: unknown) => Promise<unknown>) => fn({ db: "scoped-db", user: { id: userId }, workspaceId }) };
}
function post(body: unknown) { return POST(new Request("http://localhost/notebooklm", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), params); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context());
  mocks.read.mockResolvedValue(original);
  mocks.save.mockResolvedValue({ document: { id: "saved" }, reused: false });
  mocks.list.mockResolvedValue([]);
});
describe("NotebookLM import HTTP boundary", () => {
  it("saves the server-fetched original and ignores client-supplied replacement text", async () => {
    const response = await post({ ...original, text: "forged", contentHash });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.save).toHaveBeenCalledWith("scoped-db", workspaceId, userId, original);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("requires preview again if remote text changed", async () => {
    mocks.read.mockResolvedValue({ ...original, text: "changed" });
    expect((await post({ ...original, contentHash })).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects demo identities and readers before any Google request", async () => {
    for (const current of [context("demo"), context("supabase", "viewer")]) {
      mocks.context.mockResolvedValue(current);
      expect((await post({ ...original, contentHash })).status).toBe(403);
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("opens saved originals without contacting Google", async () => {
    const response = await GET(new Request("http://localhost/notebooklm?action=saved"), params);
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("scoped-db", workspaceId, userId);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it("does not log original text from a database failure", async () => {
    mocks.save.mockRejectedValue(new Error("SQL parameters contain PRIVATE_NOTE"));
    const response = await post({ ...original, contentHash });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE_NOTE");
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain("PRIVATE_NOTE");
  });
});
