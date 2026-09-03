import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { integrations } from "../schema";

export type QuotaUsage = {
  searchCallsUsed: number;
  searchCallsLimit: number;
  unitsUsed: number;
  unitsLimit: number;
  resetsAt: string;
};

export type QuotaLimits = { searchCallsLimit: number; unitsLimit: number };

type Snapshot = { day: string; searchCalls: number; units: number };

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function resetsAt(now: Date): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function parseSnapshot(raw: unknown, now: Date): Snapshot {
  const fallback: Snapshot = { day: today(now), searchCalls: 0, units: 0 };
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<Snapshot>;
  if (value.day !== today(now)) return fallback;
  return {
    day: value.day,
    searchCalls: typeof value.searchCalls === "number" ? value.searchCalls : 0,
    units: typeof value.units === "number" ? value.units : 0,
  };
}

/**
 * 쿼터 회계는 integrations.quota_snapshot에 남긴다.
 * 2026-06 이후 YouTube는 search.list와 videos.insert가 별도 버킷이므로 호출 수로 센다.
 * 한도는 설정값이며 코드에 고정하지 않는다.
 */
export function createQuotaLedger(input: {
  db: Database;
  provider?: string;
  limits: QuotaLimits;
  now?: () => Date;
}) {
  const provider = input.provider ?? "youtube_data";
  const nowFn = input.now ?? (() => new Date());

  async function readRow(workspaceId: string) {
    const rows = await input.db
      .select({ id: integrations.id, snapshot: integrations.quotaSnapshot })
      .from(integrations)
      .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)))
      .limit(1);
    return rows[0] ?? null;
  }

  function toUsage(snapshot: Snapshot, now: Date): QuotaUsage {
    return {
      searchCallsUsed: snapshot.searchCalls,
      searchCallsLimit: input.limits.searchCallsLimit,
      unitsUsed: snapshot.units,
      unitsLimit: input.limits.unitsLimit,
      resetsAt: resetsAt(now),
    };
  }

  return {
    async read(workspaceId: string): Promise<QuotaUsage> {
      const now = nowFn();
      const row = await readRow(workspaceId);
      return toUsage(parseSnapshot(row?.snapshot, now), now);
    },

    async consume(args: {
      workspaceId: string;
      searchCalls: number;
      units: number;
    }): Promise<QuotaUsage> {
      const now = nowFn();
      const row = await readRow(args.workspaceId);
      const current = parseSnapshot(row?.snapshot, now);

      const next: Snapshot = {
        day: today(now),
        searchCalls: current.searchCalls + args.searchCalls,
        units: current.units + args.units,
      };

      if (row) {
        await input.db
          .update(integrations)
          .set({ quotaSnapshot: next, updatedAt: sql`now()` })
          .where(eq(integrations.id, row.id));
      }

      return toUsage(next, now);
    },
  };
}

/**
 * Provider 응답 캐시. 단일 인스턴스 메모리 캐시이며 Phase 2에서 공유 저장소로 옮긴다.
 * 캐시가 비어도 동작은 같고 쿼터만 더 쓴다.
 */
export function createMemoryCache(now: () => Date = () => new Date()) {
  const store = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async get(key: string): Promise<unknown | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now().getTime()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key: string, value: unknown, ttlMinutes: number): Promise<void> {
      store.set(key, { value, expiresAt: now().getTime() + ttlMinutes * 60_000 });
    },
    clear(): void {
      store.clear();
    },
  };
}
