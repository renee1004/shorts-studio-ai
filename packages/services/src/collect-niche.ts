import { signalKeys, type CollectNicheInput, type ScoreResult } from "@shorts-os/contracts";
import {
  computeScore,
  discoverTopics,
  parseThresholds,
  parseWeights,
  videoAgeHours,
  viewVelocity,
  DomainError,
  type NormalizedVideo,
} from "@shorts-os/domain";
import {
  addWorkflowStep,
  finishWorkflowRun,
  getActiveScoreConfig,
  getNiche,
  insertNicheMetricSnapshot,
  insertVideoMetricSnapshots,
  startWorkflowRun,
  upsertReferenceVideos,
  upsertTopicWithScore,
  type Database,
} from "@shorts-os/db";
import type { YouTubeDiscoveryProvider } from "@shorts-os/providers";
import { createLogger } from "@shorts-os/observability";

export type QuotaUsageSnapshot = {
  searchCallsUsed: number;
  searchCallsLimit: number;
  unitsUsed: number;
  unitsLimit: number;
  resetsAt: string;
};

/**
 * Provider의 사용량 카운터는 프로세스 메모리에 있어 재시작하면 사라진다.
 * 실제로 쓴 쿼터를 잃지 않으려면 DB 원장에 누적해야 한다. (스펙 6.4)
 */
export type QuotaLedger = {
  read(workspaceId: string): Promise<QuotaUsageSnapshot>;
  consume(args: {
    workspaceId: string;
    searchCalls: number;
    units: number;
  }): Promise<QuotaUsageSnapshot>;
};

export type CollectNicheOptions = {
  db: Database;
  provider: YouTubeDiscoveryProvider;
  quotaLedger?: QuotaLedger;
  workspaceId: string;
  nicheId: string;
  userId: string;
  idempotencyKey: string | null;
  request: CollectNicheInput & { maxTopics?: number };
  velocityReferencePerHour: number;
  now?: Date;
  requestId?: string;
};

export type CollectNicheResult = {
  runId: string;
  reused: boolean;
  videosCollected: number;
  topicsCreated: number;
  topicsUpdated: number;
  skippedProviders: { provider: string; reason: string }[];
  quota: { searchCallsUsed: number; searchCallsLimit: number; unitsUsed: number; unitsLimit: number };
};

/**
 * Phase 1 수직 슬라이스: Niche 신호 수집 → 영상 정규화 → Snapshot 저장 →
 * Topic 후보 발견 → 설명형 점수 계산 → 승인 대기 상태로 저장.
 *
 * 연결되지 않은 Provider는 결측으로 남기고 가짜 값을 만들지 않는다.
 */
export async function collectNicheSignals(
  options: CollectNicheOptions,
): Promise<CollectNicheResult> {
  const now = options.now ?? new Date();
  const logger = createLogger({
    workspaceId: options.workspaceId,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    provider: "youtube_data",
  });

  const niche = await getNiche(options.db, options.workspaceId, options.nicheId);
  if (!niche) throw new DomainError("NOT_FOUND", "Niche를 찾을 수 없습니다.");

  const scoreConfig = await getActiveScoreConfig(options.db, options.workspaceId);
  if (!scoreConfig) {
    throw new DomainError("CONFLICT", "활성화된 Score Config가 없습니다.");
  }

  const weights = parseWeights(scoreConfig.weights);
  const thresholds = parseThresholds(scoreConfig.thresholds);

  const run = await startWorkflowRun(options.db, {
    workspaceId: options.workspaceId,
    workflowType: "niche.collect",
    entityType: "niche",
    entityId: options.nicheId,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { ...options.request, nicheId: options.nicheId },
  });

  if (run.reused) {
    logger.info({ runId: run.runId }, "동일 Idempotency Key로 기존 Run을 재사용했습니다.");
    const quota = options.quotaLedger
      ? await options.quotaLedger.read(options.workspaceId)
      : await options.provider.getQuota(options.workspaceId);
    return {
      runId: run.runId,
      reused: true,
      videosCollected: 0,
      topicsCreated: 0,
      topicsUpdated: 0,
      skippedProviders: [],
      quota,
    };
  }

  const skippedProviders = options.request.providers
    .filter((provider) => provider !== "youtube_data")
    .map((provider) => ({ provider, reason: "FEATURE_DISABLED" }));

  let sequence = 0;
  const publishedAfter = new Date(now.getTime() - options.request.lookbackDays * 86_400_000);

  try {
    const collected = new Map<string, NormalizedVideo>();
    const providerStart = await options.provider.getQuota(options.workspaceId);
    let lastQuota = options.quotaLedger
      ? await options.quotaLedger.read(options.workspaceId)
      : providerStart;
    // Provider는 누적값을 주므로 증가분만 원장에 넘긴다.
    let countedSearchCalls = providerStart.searchCallsUsed;
    let countedUnits = providerStart.unitsUsed;

    for (const keyword of niche.seedKeywords) {
      sequence += 1;
      const search = await options.provider.searchVideos({
        workspaceId: options.workspaceId,
        query: keyword,
        regionCode: niche.targetCountry,
        relevanceLanguage: niche.targetLanguage,
        publishedAfter,
        maxResults: options.request.maxVideosPerKeyword,
        forceRefresh: options.request.forceRefresh,
      });

      const detail = await options.provider.getVideos({
        workspaceId: options.workspaceId,
        videoIds: search.videoIds,
        forceRefresh: options.request.forceRefresh,
      });

      for (const video of detail.videos) collected.set(video.externalVideoId, video);

      if (options.quotaLedger) {
        lastQuota = await options.quotaLedger.consume({
          workspaceId: options.workspaceId,
          searchCalls: Math.max(0, detail.quota.searchCallsUsed - countedSearchCalls),
          units: Math.max(0, detail.quota.unitsUsed - countedUnits),
        });
      } else {
        lastQuota = detail.quota;
      }
      countedSearchCalls = detail.quota.searchCallsUsed;
      countedUnits = detail.quota.unitsUsed;

      await addWorkflowStep(options.db, {
        workspaceId: options.workspaceId,
        runId: run.runId,
        sequenceNo: sequence,
        stepKey: `search:${keyword}`,
        provider: "youtube_data",
        status: "succeeded",
        inputSummary: { keyword, maxResults: options.request.maxVideosPerKeyword },
        outputSummary: {
          videoIds: search.videoIds.length,
          fromCache: search.fromCache,
          quota: detail.quota,
        },
        providerRequestId: search.providerRequestId,
      });
    }

    const videos = [...collected.values()];
    const videoIdMap = await upsertReferenceVideos(options.db, options.workspaceId, videos, { now });

    await insertVideoMetricSnapshots(
      options.db,
      options.workspaceId,
      videos.flatMap((video) => {
        const referenceVideoId = videoIdMap.get(video.externalVideoId);
        if (!referenceVideoId || !video.publishedAt) return [];
        const ageHours = videoAgeHours(video.publishedAt, now);
        return [
          {
            referenceVideoId,
            viewCount: video.viewCount,
            likeCount: video.likeCount,
            commentCount: video.commentCount,
            viewVelocity: viewVelocity(video.viewCount, ageHours),
            // 첫 수집에서는 비교군이 없어 Breakout을 계산하지 않는다. (스펙 5.4)
            breakoutRatio: null,
            snapshotAgeHours: ageHours,
            collectedAt: now,
          },
        ];
      }),
    );

    const candidates = discoverTopics({
      videos,
      excludeTerms: niche.excludeTerms,
      velocityReferencePerHour: options.velocityReferencePerHour,
      maxTopics: options.request.maxTopics ?? 20,
      now,
      reliability: { youtube: 0.95, derived: 0.7 },
      unavailable: {
        searchInterest: "GOOGLE_TRENDS_NOT_CONNECTED",
        commercialIntent: "GOOGLE_ADS_NOT_CONNECTED",
      },
    });

    let created = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const score: ScoreResult = computeScore({
        signals: candidate.signals,
        weights,
        thresholds,
        configVersion: scoreConfig.version,
        penalties: candidate.penalties,
        calculatedAt: now,
      });

      const result = await upsertTopicWithScore(
        options.db,
        options.workspaceId,
        {
          nicheId: options.nicheId,
          title: candidate.title,
          normalizedTitle: candidate.normalizedTitle,
          angleHint: candidate.angleHint,
          targetCountry: niche.targetCountry,
          targetLanguage: niche.targetLanguage,
          discoveredBy: `youtube_data:${options.provider.mode}`,
          score,
          scoreConfigId: scoreConfig.id,
          videoIds: candidate.videoIds,
          collectedAt: now,
        },
        videoIdMap,
      );

      if (result.created) created += 1;
      else updated += 1;
    }

    // Niche 단위 점수는 주제 후보 신호를 신호별로 평균해 만든다.
    // 값이 하나도 없는 신호는 평균을 만들지 않고 결측으로 남긴다.
    const nicheScore =
      candidates.length > 0
        ? computeScore({
            signals: signalKeys.map((key) => {
              const entries = candidates
                .map((candidate) => candidate.signals.find((signal) => signal.key === key))
                .filter((signal): signal is NonNullable<typeof signal> => signal !== undefined);
              const scored = entries.filter((signal) => signal.normalizedScore !== null);

              if (scored.length === 0) {
                return {
                  key,
                  rawValue: null,
                  normalizedScore: null,
                  sourceCount: 0,
                  freshnessHours: null,
                  providerReliability: 0.7,
                  unavailableReason: entries[0]?.unavailableReason ?? "SIGNAL_NOT_COLLECTED",
                };
              }

              const average =
                scored.reduce((sum, signal) => sum + (signal.normalizedScore ?? 0), 0) /
                scored.length;
              const freshness = scored
                .map((signal) => signal.freshnessHours)
                .filter((value): value is number => value !== null);

              return {
                key,
                rawValue: null,
                normalizedScore: Math.round(average * 100) / 100,
                sourceCount: Math.max(...scored.map((signal) => signal.sourceCount)),
                freshnessHours: freshness.length > 0 ? Math.min(...freshness) : null,
                providerReliability: scored[0]?.providerReliability ?? 0.7,
              };
            }),
            weights,
            thresholds,
            configVersion: scoreConfig.version,
            calculatedAt: now,
          })
        : null;

    if (nicheScore) {
      await insertNicheMetricSnapshot(options.db, {
        workspaceId: options.workspaceId,
        nicheId: options.nicheId,
        scoreConfigId: scoreConfig.id,
        score: nicheScore,
        sampleSize: videos.length,
        collectedAt: now,
      });
    }

    sequence += 1;
    await addWorkflowStep(options.db, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: sequence,
      stepKey: "topics:discover",
      status: "succeeded",
      inputSummary: { videos: videos.length },
      outputSummary: { created, updated, candidates: candidates.length },
    });

    await finishWorkflowRun(options.db, {
      runId: run.runId,
      status: "succeeded",
      output: {
        videosCollected: videos.length,
        topicsCreated: created,
        topicsUpdated: updated,
        skippedProviders,
      },
    });

    logger.info(
      { runId: run.runId, videos: videos.length, created, updated },
      "니치 수집을 완료했습니다.",
    );

    return {
      runId: run.runId,
      reused: false,
      videosCollected: videos.length,
      topicsCreated: created,
      topicsUpdated: updated,
      skippedProviders,
      quota: lastQuota,
    };
  } catch (error) {
    const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
    const message = error instanceof Error ? error.message : String(error);

    sequence += 1;
    await addWorkflowStep(options.db, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: sequence,
      stepKey: "collect:failed",
      provider: "youtube_data",
      status: "failed",
      errorCode: code,
      errorMessage: message,
    });
    await finishWorkflowRun(options.db, {
      runId: run.runId,
      status: "failed",
      errorCode: code,
      errorMessage: message,
    });

    logger.error({ runId: run.runId, code }, message);
    throw error;
  }
}
