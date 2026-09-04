import { z } from "zod";
import { idempotencyKeySchema } from "./common";

export const RENDER_MANIFEST_VERSION = "render.manifest.v2";
export const RENDER_ENGINE_VERSION = "ffmpeg.post.v1";

export const mediaAssetTypes = [
  "image",
  "video_clip",
  "voice",
  "music",
  "subtitle",
  "thumbnail",
  "final_video",
] as const;
export const mediaAssetTypeSchema = z.enum(mediaAssetTypes);
export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>;

export const renderShotStrategies = ["user_upload", "placeholder", "generated"] as const;
export const renderShotStrategySchema = z.enum(renderShotStrategies);
export type RenderShotStrategy = z.infer<typeof renderShotStrategySchema>;

export const mediaCapabilitiesSchema = z.object({
  provider: z.string(),
  mode: z.enum(["mock", "live", "none"]),
  videoClips: z.boolean(),
  tts: z.boolean(),
  music: z.boolean(),
  /** 스펙: 글자는 AI 푸티지 안이 아니라 후반에서 합성한다. */
  textInFootage: z.literal(false),
  requirement: z.string().nullable(),
});
export type MediaCapabilities = z.infer<typeof mediaCapabilitiesSchema>;

export const renderShotManifestSchema = z.object({
  shotId: z.string().uuid(),
  sequenceNo: z.number().int().positive(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  narration: z.string().nullable(),
  onScreenText: z.string().min(1),
  visualDescription: z.string(),
  strategy: renderShotStrategySchema,
  clipAssetId: z.string().uuid().nullable(),
  clipChecksum: z.string().nullable(),
  execution: z.object({
    status: z.enum(["pending", "succeeded", "failed", "reused"]),
    assetId: z.string().uuid().nullable(),
    error: z.string().nullable(),
  }),
});
export type RenderShotManifest = z.infer<typeof renderShotManifestSchema>;

export const renderManifestSchema = z
  .object({
    version: z.literal(RENDER_MANIFEST_VERSION),
    engine: z.literal(RENDER_ENGINE_VERSION),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    scriptId: z.string().uuid(),
    scriptVersion: z.number().int().positive(),
    contentApprovalId: z.string().uuid(),
    contentApprovalSnapshotHash: z.string().min(1),
    captionsInPost: z.literal(true),
    allowPlaceholder: z.boolean(),
    shots: z.array(renderShotManifestSchema).min(1),
    voiceAssetId: z.string().uuid().nullable(),
    musicAssetId: z.string().uuid().nullable(),
    retryOf: z.string().uuid().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.width * 16 !== value.height * 9) {
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "Render Manifest 해상도는 정확히 9:16이어야 합니다.",
      });
    }
  });
export type RenderManifest = z.infer<typeof renderManifestSchema>;

export const enqueueRenderSchema = z
  .object({
    scriptId: z.string().uuid().optional(),
    allowPlaceholder: z.boolean().default(true),
    width: z.number().int().min(360).max(1080).default(1080),
    height: z.number().int().min(640).max(1920).default(1920),
    fps: z.number().int().min(24).max(30).default(30),
  })
  .superRefine((value, context) => {
    if (value.width * 16 !== value.height * 9) {
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "Render 해상도는 정확히 9:16이어야 합니다.",
      });
    }
  });
export type EnqueueRenderInput = z.infer<typeof enqueueRenderSchema>;

export const retryRenderSchema = z.object({
  shotIds: z.array(z.string().uuid()).min(1).max(16),
});
export type RetryRenderInput = z.infer<typeof retryRenderSchema>;

export const approveRenderSchema = z.object({
  comment: z.string().max(500).optional(),
});

export const factoryKanbanColumns = [
  "queued",
  "generating",
  "ready",
  "failed",
  "approved",
] as const;
export const factoryKanbanColumnSchema = z.enum(factoryKanbanColumns);
export type FactoryKanbanColumn = z.infer<typeof factoryKanbanColumnSchema>;

export { idempotencyKeySchema };
