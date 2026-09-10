import {
  getMembership,
  getWorkspaceSettings,
  listWorkspacesForUser,
  serviceDb,
  withUserSession,
  type Database,
  createMemoryCache,
  createQuotaLedger,
} from "@shorts-os/db";
import { DomainError } from "@shorts-os/domain";
import { ProviderRegistry } from "@shorts-os/providers";
import { roleHasPermission, type MemberRole, type Permission } from "@shorts-os/contracts";
import { appDatabaseUrl, databaseUrl, env, flagsFor } from "./env";
import { requireUser, type SessionUser } from "./auth";

/** 요청 하나가 쓰는 문맥. RLS 세션과 Provider 구성을 함께 만든다. */
export type WorkspaceContext = {
  user: SessionUser;
  workspaceId: string;
  role: MemberRole;
  /** 사용자 세션 접속. RLS가 적용되며 업무 데이터 읽기·쓰기에 쓴다. */
  db: Database;
  /**
   * 시스템 접속. Workflow Run/Step, Snapshot, Audit Log처럼
   * 스펙 6.4에서 사용자 쓰기를 허용하지 않는 기록에만 쓴다.
   * 반드시 requireRole로 권한을 확인한 뒤에 사용한다.
   */
  system: Database;
  registry: ProviderRegistry;
  requireRole: (permission: Permission) => void;
};

const cache = createMemoryCache();

export async function listMyWorkspaces() {
  const user = await requireUser();
  return withUserSession(appDatabaseUrl(), user.id, (db) => listWorkspacesForUser(db, user.id));
}

/**
 * 사용자 세션으로 워크스페이스 문맥을 만든다.
 * 멤버가 아니면 RLS가 데이터를 감추고, 여기서도 명시적으로 403을 던진다.
 */
export async function workspaceContext(workspaceId: string): Promise<{
  user: SessionUser;
  role: MemberRole;
  registry: ProviderRegistry;
  run: <T>(fn: (context: WorkspaceContext) => Promise<T>) => Promise<T>;
}> {
  const user = await requireUser();

  const role = await withUserSession(appDatabaseUrl(), user.id, (db) =>
    getMembership(db, workspaceId, user.id),
  );
  if (!role) {
    throw new DomainError("PERMISSION_DENIED", "이 워크스페이스에 접근할 수 없습니다.");
  }

  const settings = await withUserSession(appDatabaseUrl(), user.id, (db) =>
    getWorkspaceSettings(db, workspaceId),
  );
  const { flags } = flagsFor(settings?.featureFlags);
  const current = env();

  const registry = new ProviderRegistry({
    appMode: current.APP_MODE,
    flags,
    youtubeApiKey: current.YOUTUBE_API_KEY,
    geminiApiKey: current.GEMINI_API_KEY,
    geminiResearchTimeoutMs: current.GEMINI_RESEARCH_TIMEOUT_MS,
    geminiResearchModel: current.GEMINI_RESEARCH_MODEL,
    geminiSearchGrounding: current.GEMINI_SEARCH_GROUNDING,
    geminiContentModel: current.GEMINI_CONTENT_MODEL,
    quota: createQuotaLedger({
      db: serviceDb(databaseUrl()),
      limits: {
        searchCallsLimit: current.YOUTUBE_SEARCH_DAILY_LIMIT,
        unitsLimit: current.YOUTUBE_UNITS_DAILY_LIMIT,
      },
    }),
    cache,
    cacheTtlMinutes: current.YOUTUBE_CACHE_TTL_MINUTES,
    retry: {
      maxAttempts: current.PROVIDER_MAX_ATTEMPTS,
      baseDelayMs: 300,
      timeoutMs: current.PROVIDER_TIMEOUT_MS,
    },
  });

  return {
    user,
    role,
    registry,
    run: <T>(fn: (context: WorkspaceContext) => Promise<T>) =>
      withUserSession(appDatabaseUrl(), user.id, (db) =>
        fn({
          user,
          workspaceId,
          role,
          db,
          system: serviceDb(databaseUrl()),
          registry,
          requireRole: (permission) => {
            if (!roleHasPermission(role, permission)) {
              throw new DomainError(
                "PERMISSION_DENIED",
                `${role} 역할에는 이 작업 권한이 없습니다.`,
                { details: { role, permission } },
              );
            }
          },
        }),
      ),
  };
}

/** 워커나 시드처럼 RLS를 우회해야 하는 작업 전용. 요청 경로에서는 쓰지 않는다. */
export function serviceDatabase(): Database {
  return serviceDb(databaseUrl());
}
