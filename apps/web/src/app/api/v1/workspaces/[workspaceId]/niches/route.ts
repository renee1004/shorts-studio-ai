import { createNicheSchema } from "@shorts-os/contracts";
import { insertNiche, listNiches, writeAuditLog } from "@shorts-os/db";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length >= 2 ? slug.slice(0, 60) : `niche-${Date.now().toString(36)}`;
}

export const GET = route<{ workspaceId: string }>(async ({ requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);

  const rows = await context.run(({ db }) => listNiches(db, workspaceId));

  return ok(
    {
      niches: rows.map(({ niche, latest, history }) => ({
        id: niche.id,
        name: niche.name,
        slug: niche.slug,
        status: niche.status,
        targetCountry: niche.targetCountry,
        targetLanguage: niche.targetLanguage,
        seedKeywords: niche.seedKeywords,
        excludeTerms: niche.excludeTerms,
        opportunityScore: latest?.opportunityScore ? Number(latest.opportunityScore) : null,
        confidenceScore: latest?.confidenceScore ? Number(latest.confidenceScore) : null,
        decisionBand: latest?.decisionBand ?? null,
        lastScanAt: latest?.collectedAt?.toISOString() ?? null,
        historyCount: history.length,
      })),
      providers: context.registry.availability(),
    },
    requestId,
  );
});

export const POST = route<{ workspaceId: string }>(async ({ request, requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const input = await parseBody(request, createNicheSchema);

  const created = await context.run(async ({ db, system, requireRole, user }) => {
    requireRole("niche:write");
    try {
      const niche = await insertNiche(db, {
        workspaceId,
        createdBy: user.id,
        slug: slugify(input.name),
        name: input.name,
        description: input.description,
        targetCountry: input.targetCountry,
        targetLanguage: input.targetLanguage,
        seedKeywords: input.seedKeywords,
        includeTerms: input.includeTerms,
        excludeTerms: input.excludeTerms,
      });

      await writeAuditLog(system, {
        workspaceId,
        actorUserId: user.id,
        action: "niche.create",
        entityType: "niche",
        entityId: niche.id,
        afterState: { name: niche.name, seedKeywords: niche.seedKeywords },
        requestId,
      });

      return niche;
    } catch (error) {
      if (typeof error === "object" && error && "code" in error) {
        if ((error as { code?: string }).code === "23505") {
          throw new DomainError(
            "CONFLICT",
            "같은 시장·언어에 같은 이름의 Niche가 이미 있습니다.",
          );
        }
      }
      throw error;
    }
  });

  return ok({ id: created.id, name: created.name, slug: created.slug }, requestId, 201);
});
