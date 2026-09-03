import { z } from "zod";

/**
 * 스펙 14.4의 기본값. autoPublish는 Full Product에서도 false를 유지한다.
 * Phase에 도달하지 않은 Provider는 여기서 꺼진 상태로 유지하고, 코드에는 하드코딩하지 않는다.
 */
export const featureFlagSchema = z.object({
  youtubeDiscovery: z.boolean().default(true),
  geminiResearch: z.boolean().default(false),
  notebookSync: z.boolean().default(false),
  googleTrendsApi: z.boolean().default(false),
  googleAdsApi: z.boolean().default(false),
  videoGeneration: z.boolean().default(false),
  youtubePublishing: z.boolean().default(false),
  youtubeAnalytics: z.boolean().default(false),
  autoPublish: z.boolean().default(false),
});

export type FeatureFlags = z.infer<typeof featureFlagSchema>;

export const defaultFeatureFlags: FeatureFlags = featureFlagSchema.parse({});

/**
 * 재정의용 스키마. featureFlagSchema.partial()은 default가 남아 있어
 * 값을 주지 않은 키까지 채워버리므로 별도로 정의한다.
 */
export const featureFlagOverrideSchema = z.object({
  youtubeDiscovery: z.boolean().optional(),
  geminiResearch: z.boolean().optional(),
  notebookSync: z.boolean().optional(),
  googleTrendsApi: z.boolean().optional(),
  googleAdsApi: z.boolean().optional(),
  videoGeneration: z.boolean().optional(),
  youtubePublishing: z.boolean().optional(),
  youtubeAnalytics: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
});

/** Phase 0-1에서 켤 수 있는 플래그. 나머지는 해당 Phase까지 강제로 꺼둔다. */
const releasableFlags = new Set<keyof FeatureFlags>(["youtubeDiscovery"]);

export type FlagSource = "default" | "workspace" | "env";

export type ResolvedFlag = {
  key: keyof FeatureFlags;
  enabled: boolean;
  source: FlagSource;
  /** 요청했지만 아직 구현 Phase에 도달하지 않아 강제로 꺼진 경우 */
  lockedReason?: string;
};

export function resolveFeatureFlags(input: {
  workspaceFlags?: unknown;
  envOverride?: unknown;
}): { flags: FeatureFlags; resolved: ResolvedFlag[] } {
  const workspace = featureFlagOverrideSchema.safeParse(input.workspaceFlags ?? {});
  const env = featureFlagOverrideSchema.safeParse(input.envOverride ?? {});

  const workspaceFlags = workspace.success ? workspace.data : {};
  const envFlags = env.success ? env.data : {};

  const resolved: ResolvedFlag[] = [];
  const flags = { ...defaultFeatureFlags };

  for (const key of Object.keys(defaultFeatureFlags) as (keyof FeatureFlags)[]) {
    let enabled = defaultFeatureFlags[key];
    let source: FlagSource = "default";

    if (workspaceFlags[key] !== undefined) {
      enabled = workspaceFlags[key];
      source = "workspace";
    }
    if (envFlags[key] !== undefined) {
      enabled = envFlags[key];
      source = "env";
    }

    // 아직 구현 Phase에 도달하지 않은 플래그는 요청 여부와 무관하게 잠금 사유를 남긴다.
    // 화면이 "왜 못 켜는지"를 항상 보여줄 수 있어야 한다. (스펙 8.1)
    let lockedReason: string | undefined;
    if (!releasableFlags.has(key)) {
      enabled = false;
      lockedReason = "NOT_IMPLEMENTED_IN_CURRENT_PHASE";
    }

    flags[key] = enabled;
    resolved.push(lockedReason ? { key, enabled, source, lockedReason } : { key, enabled, source });
  }

  return { flags, resolved };
}
