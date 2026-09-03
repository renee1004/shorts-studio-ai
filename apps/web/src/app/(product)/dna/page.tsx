import { roleHasPermission } from "@shorts-os/contracts";
import { listDnaPatterns, listReferenceVideosForLibrary, readImportMeta } from "@shorts-os/db";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { DnaLibraryClient } from "@/components/product/dna-library-client";

export const dynamic = "force-dynamic";

export default async function DnaPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const { videos, patterns } = await context.run(async ({ db }) => ({
    videos: await listReferenceVideosForLibrary(db, workspace.id),
    patterns: await listDnaPatterns(db, workspace.id),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">DNA Library</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          성공 영상의 문장이 아니라 Hook 유형, 정보 배열, CTA 같은 추상 구조만 남깁니다. 대본
          제공 여부는 영상마다 분명히 표시됩니다.
        </p>
      </header>
      <DnaLibraryClient
        workspaceId={workspace.id}
        canWrite={roleHasPermission(workspace.role, "topic:write")}
        videos={videos.map((video) => {
          const meta = readImportMeta(video.metadata);
          return {
            id: video.id,
            title: video.title,
            url: video.url,
            durationSeconds: video.durationSeconds,
            importSource: meta.importSource,
            transcriptProvided: meta.transcriptProvided,
          };
        })}
        patterns={patterns.map((pattern) => {
          const structured = pattern.structuredPattern as {
            transcriptIncluded?: boolean;
            hookCategory?: string;
          };
          return {
            id: pattern.id,
            name: pattern.name,
            patternType: pattern.patternType,
            referenceVideoId: pattern.referenceVideoId,
            transcriptIncluded: structured.transcriptIncluded === true,
            hookCategory: structured.hookCategory ?? "-",
            createdAt: pattern.createdAt.toISOString(),
            evidence: (pattern.evidence as { evidenceType: string; field: string; note: string }[]) ?? [],
          };
        })}
      />
    </div>
  );
}
