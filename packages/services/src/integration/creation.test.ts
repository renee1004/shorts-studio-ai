import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { createCreationProject } from "../creation";

const owner = "00000000-0000-4000-8000-0000000000e1";
let service: Database;
let workspaceId: string;
const appUrl = process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL;
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !appUrl)
    throw new Error("An isolated test database is required.");
  service = serviceDb(process.env.DATABASE_URL);
  workspaceId = await withUserSession(appUrl, owner, async (db) => {
    const rows = await db.execute<{ id: string }>(
      sql`select create_workspace_with_owner('Import test', ${`import-${crypto.randomUUID()}`}, 'Asia/Seoul', 'ko-KR') as id`,
    );
    return rows[0]!.id;
  });
});
afterAll(async () => {
  if (workspaceId)
    await service.execute(
      sql`delete from workspaces where id = ${workspaceId}`,
    );
  await closePools();
});
const input = () => ({
  mode: "script",
  topic: "직장인 쓸모노트",
  operationId: crypto.randomUUID(),
  suppliedText: " 첫 번째 문장입니다.\r\n\r\n두 번째 문장입니다. ",
});
const create = (request: unknown, userId = owner) =>
  withUserSession(appUrl!, userId, (db) =>
    createCreationProject({ db, workspaceId, userId, input: request }),
  );

describe("creation imports without providers", () => {
  it("preserves script and unverified claims without QA or approval", async () => {
    const result = await create(input());
    expect(result.latestScript?.scriptText).toBe(
      "첫 번째 문장입니다.\n두 번째 문장입니다.",
    );
    expect(result.shots).toHaveLength(2);
    expect(result.latestScript?.factualClaims).toEqual(
      expect.arrayContaining([expect.objectContaining({ unverified: true })]),
    );
    expect(result.qa).toHaveLength(0);
    expect(result.approvals).toHaveLength(0);
  });
  it("concurrent requests and a later replay retain one project and script", async () => {
    const request = input();
    const [a, b] = await Promise.all([create(request), create(request)]);
    expect(a.project.id).toBe(b.project.id);
    const replay = await create({
      ...request,
      suppliedText: request.suppliedText.trim().replace(/\r\n+/g, "\n"),
    });
    expect(replay.project.id).toBe(a.project.id);
    expect(replay.scripts).toHaveLength(1);
    await expect(
      create({ ...request, suppliedText: "바뀐 문장\n다른 문장" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(create({ ...request, mode: "notes" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("stores 4000 characters of notes as needs_review with no generated script", async () => {
    const result = await create({
      ...input(),
      mode: "notes",
      suppliedText: "가".repeat(4000),
    });
    expect(result.brief?.content.executiveSummary).toHaveLength(4000);
    expect(result.brief?.status).toBe("needs_review");
    expect(result.latestScript).toBeNull();
  });
  it("invalid input and non-members cannot create records", async () => {
    const request = input();
    await expect(
      create({ ...request, suppliedText: "한 문단" }),
    ).rejects.toThrow();
    await expect(
      create(request, "00000000-0000-4000-8000-0000000000e2"),
    ).rejects.toThrow();
    const rows = await service.execute(
      sql`select id from topics where id = ${request.operationId}`,
    );
    expect(rows).toHaveLength(0);
  });
  it("rolls back a saved import if the enclosing request transaction fails", async () => {
    const request = input();
    await expect(
      withUserSession(appUrl!, owner, async (db) => {
        await createCreationProject({
          db,
          workspaceId,
          userId: owner,
          input: request,
        });
        throw new Error("simulated request rollback");
      }),
    ).rejects.toThrow("simulated request rollback");
    expect(
      await service.execute(
        sql`select id from topics where id = ${request.operationId}`,
      ),
    ).toHaveLength(0);
    expect((await create(request)).scripts).toHaveLength(1);
    const costs = await service.execute(
      sql`select id from cost_events where workspace_id = ${workspaceId}`,
    );
    expect(costs).toHaveLength(0);
  });
});
