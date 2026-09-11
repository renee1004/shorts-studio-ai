import { createHash } from "node:crypto";
import { z } from "zod";
import { notebookItemSchema, roleHasPermission } from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import {
  saveNotebookImport,
  listNotebookImports,
  getNotebookImport,
} from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";
import {
  notebookConnection,
  listRemoteNotebooks,
  listRemoteItems,
  readRemoteItem,
} from "@/server/notebooklm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hash = (document: { title: string; text: string }) =>
  createHash("sha256")
    .update(JSON.stringify([document.title, document.text]))
    .digest("hex");
function privateResponse(data: unknown, requestId: string, status = 200) {
  const response = ok(data, requestId, status);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = route<{ workspaceId: string }>(
  async ({ request, params, requestId }) => {
    const context = await workspaceContext(params.workspaceId);
    const query = new URL(request.url).searchParams;
    const action = query.get("action");
    if (context.user.provider !== "supabase") {
      if (action === "status")
        return privateResponse(
          {
            configured: false,
            userId: context.user.id,
            reason: "verified-login-required",
          },
          requestId,
        );
      if (action === "saved" && !query.has("id"))
        return privateResponse([], requestId);
      throw new DomainError(
        "PERMISSION_DENIED",
        "개인 NotebookLM 자료를 가져오려면 체험 계정 대신 이메일로 로그인해 주세요.",
      );
    }
    if (action === "saved") {
      const data = await context.run<unknown>(
        async ({ db, user, workspaceId }) =>
          query.has("id")
            ? getNotebookImport(
                db,
                workspaceId,
                user.id,
                z.string().uuid().parse(query.get("id")),
              )
            : listNotebookImports(db, workspaceId, user.id),
      );
      return privateResponse(data, requestId);
    }
    if (!roleHasPermission(context.role, "topic:write"))
      throw new DomainError("PERMISSION_DENIED", "가져오기 권한이 없습니다.");
    if (action === "status")
      return privateResponse(
        await notebookConnection(context.user.id),
        requestId,
      );
    if (action === "notebooks")
      return privateResponse(
        await listRemoteNotebooks(context.user.id),
        requestId,
      );
    if (action === "items")
      return privateResponse(
        await listRemoteItems(
          context.user.id,
          z.string().uuid().parse(query.get("notebookId")),
        ),
        requestId,
      );
    if (action === "item") {
      const document = await readRemoteItem(
        context.user.id,
        notebookItemSchema.parse(Object.fromEntries(query)),
      );
      return privateResponse(
        { ...document, contentHash: hash(document) },
        requestId,
      );
    }
    throw new DomainError(
      "VALIDATION_FAILED",
      "가져오기 요청을 확인해 주세요.",
    );
  },
);
export const POST = route<{ workspaceId: string }>(
  async ({ request, params, requestId }) => {
    const input = await parseBody(
      request,
      notebookItemSchema.extend({
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    );
    const context = await workspaceContext(params.workspaceId);
    if (context.user.provider !== "supabase")
      throw new DomainError(
        "PERMISSION_DENIED",
        "개인 NotebookLM 자료를 가져오려면 체험 계정 대신 이메일로 로그인해 주세요.",
      );
    if (!roleHasPermission(context.role, "topic:write"))
      throw new DomainError("PERMISSION_DENIED", "가져오기 권한이 없습니다.");
    const document = await readRemoteItem(context.user.id, input);
    if (hash(document) !== input.contentHash)
      throw new DomainError(
        "CONFLICT",
        "NotebookLM 원문이 변경되었습니다. 다시 선택하여 확인한 뒤 저장해 주세요.",
      );
    const result = await context
      .run(({ db, user, workspaceId }) =>
        saveNotebookImport(db, workspaceId, user.id, document),
      )
      .catch((error: unknown) => {
        if (error instanceof DomainError) throw error;
        // Database errors may include bound original text; keep it out of request logs.
        throw new DomainError(
          "INTERNAL_ERROR",
          "원문 저장 결과를 확인하지 못했습니다. 저장한 원문 목록을 확인한 뒤 다시 시도해 주세요.",
        );
      });
    return privateResponse(result, requestId, result.reused ? 200 : 201);
  },
);
