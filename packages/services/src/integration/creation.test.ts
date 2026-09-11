import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { createCreationProject } from "../creation";
import { qaCheckTypes } from "@shorts-os/contracts";
import {
  pcmToWave,
  UnavailableVideoGenerationProvider,
} from "@shorts-os/providers";
import { runProjectQa, decideProjectApproval } from "../studio";
import { generateNarration } from "../narration";
import {
  enqueueProjectRender,
  executeRenderJob,
  localMediaRoot,
} from "../factory";
import { rm } from "node:fs/promises";
import path from "node:path";

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
  if (workspaceId) {
    await service.execute(
      sql`delete from workspaces where id = ${workspaceId}`,
    );
    await rm(path.join(localMediaRoot(), workspaceId), {
      recursive: true,
      force: true,
    });
  }
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
  it("takes an imported fixture through explicit QA/approval and a render with synthetic audio", async () => {
    const detail = await create(input());
    const options = {
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: detail.project.id,
    };
    await expect(
      decideProjectApproval({ ...options, request: { decision: "approved" } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const qa = await runProjectQa({
      ...options,
      checks: [...qaCheckTypes],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(qa.reused).toBe(false);
    await decideProjectApproval({
      ...options,
      request: { decision: "approved", comment: "Synthetic test fixture only" },
    });
    const pcm = Buffer.alloc(24000);
    for (let i = 0; i < pcm.length / 2; i++)
      pcm.writeInt16LE(
        Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / 24000)),
        i * 2,
      );
    let calls = 0;
    const narrationOptions = {
      db: service,
      workspaceId,
      projectId: detail.project.id,
      shots: detail.shots,
      model: "fixture",
      voice: "fixture",
      provider: {
        synthesize: async () => {
          calls++;
          return pcmToWave(pcm);
        },
      },
    };
    const voice = await generateNarration(narrationOptions);
    expect((await generateNarration(narrationOptions)).id).toBe(voice.id);
    expect(calls).toBe(2);
    const queued = await enqueueProjectRender({
      ...options,
      request: { allowPlaceholder: true, width: 360, height: 640, fps: 24 },
      idempotencyKey: crypto.randomUUID(),
      video: new UnavailableVideoGenerationProvider(),
    });
    const rendered = await executeRenderJob(queued.renderJobId, service);
    expect(rendered.status).toBe("succeeded");
    expect(rendered.outputChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(rendered.probe).toMatchObject({ hasNarration: true });
    // This is a placeholder fixture, never evidence of a finished AI-generated short.
  }, 90_000);
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
