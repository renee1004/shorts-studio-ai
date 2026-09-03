import { loadServerEnv, resolveFeatureFlags, type FeatureFlags } from "@shorts-os/config";

/**
 * 서버 전용 설정 진입점. 이 모듈을 Client Component에서 import하면 빌드가 깨지도록
 * 서버에서만 쓰는 값만 다룬다.
 */
let cachedEnv: ReturnType<typeof loadServerEnv> | null = null;

export function env() {
  cachedEnv ??= loadServerEnv();
  return cachedEnv;
}

export function databaseUrl(): string {
  return env().DATABASE_URL;
}

/** RLS를 실제로 적용하려면 테이블 소유자가 아닌 역할로 붙어야 한다. */
export function appDatabaseUrl(): string {
  const current = env();
  return current.DATABASE_APP_URL ?? current.DATABASE_URL;
}

export function flagsFor(workspaceFlags?: unknown): {
  flags: FeatureFlags;
  resolved: ReturnType<typeof resolveFeatureFlags>["resolved"];
} {
  const current = env();
  return resolveFeatureFlags({
    workspaceFlags: workspaceFlags ?? {},
    envOverride: current.featureFlagsOverride,
  });
}
