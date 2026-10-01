import "server-only";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  notebookDocumentSchema,
  notebookItemSchema,
} from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("notebooks") }),
  z.object({ action: z.literal("items"), notebookId: z.string().uuid() }),
  notebookItemSchema.extend({ action: z.literal("item") }),
]);
const listSchema = z
  .array(z.object({ id: z.string().uuid(), title: z.string() }))
  .max(10000);
const itemsSchema = z
  .array(
    z.object({
      id: notebookItemSchema.shape.itemId,
      title: z.string(),
      kind: notebookItemSchema.shape.kind,
    }),
  )
  .max(10000);

function storagePath(userId: string) {
  return path.join(
    process.env.NOTEBOOKLM_STORAGE_ROOT ??
      path.resolve(process.cwd(), "../../.data/notebooklm"),
    z.string().uuid().parse(userId),
    "storage_state.json",
  );
}

export async function notebookConnection(userId: string) {
  if (process.env.NOTEBOOKLM_ENABLED !== "true")
    return { configured: false, userId };
  try {
    await access(storagePath(userId));
    return { configured: true, userId };
  } catch {
    return { configured: false, userId };
  }
}

async function readNotebook(userId: string, input: unknown): Promise<unknown> {
  const request = requestSchema.parse(input);
  if (!(await notebookConnection(userId)).configured)
    throw new DomainError(
      "PROVIDER_NOT_CONNECTED",
      "NotebookLM 연결이 필요합니다. 최초 한 번 Google 계정으로 로그인해 주세요.",
    );
  const script =
    process.env.NOTEBOOKLM_BRIDGE_SCRIPT ??
    path.resolve(process.cwd(), "../../scripts/notebooklm_bridge.py");
  const allowedEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PYTHONIOENCODING: "utf-8",
  };
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "HOME",
    "USERPROFILE",
    "TEMP",
    "TMP",
    "TMPDIR",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ])
    if (process.env[key]) allowedEnv[key] = process.env[key];
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.env.NOTEBOOKLM_PYTHON ?? "python3",
      [script, storagePath(userId)],
      {
        shell: false,
        windowsHide: true,
        env: allowedEnv,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    const unavailable = () =>
      reject(
        new DomainError(
          "PROVIDER_UNAVAILABLE",
          "NotebookLM을 읽지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
        ),
      );
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new DomainError(
          "PROVIDER_TIMEOUT",
          "NotebookLM 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
        ),
      );
    }, 40000);
    child.on("error", () => {
      clearTimeout(timer);
      unavailable();
    });
    child.stdin.on("error", unavailable);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8_000_000) {
        child.kill();
        clearTimeout(timer);
        unavailable();
      } else chunks.push(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) unavailable();
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(JSON.stringify(request));
  });
  let result: { data?: unknown; error?: string };
  try {
    result = JSON.parse(raw);
  } catch {
    throw new DomainError(
      "PROVIDER_UNAVAILABLE",
      "NotebookLM 응답을 읽지 못했습니다.",
    );
  }
  if (result.error)
    throw new DomainError(
      result.error === "timeout" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
      "NotebookLM을 읽지 못했습니다. Google 로그인 상태를 확인해 주세요.",
    );
  return result.data;
}

export async function listRemoteNotebooks(userId: string) {
  return listSchema.parse(await readNotebook(userId, { action: "notebooks" }));
}
export async function listRemoteItems(userId: string, notebookId: string) {
  return itemsSchema.parse(
    await readNotebook(userId, { action: "items", notebookId }),
  );
}
export async function readRemoteItem(
  userId: string,
  input: z.infer<typeof notebookItemSchema>,
) {
  return notebookDocumentSchema.parse(
    await readNotebook(userId, { ...input, action: "item" }),
  );
}
