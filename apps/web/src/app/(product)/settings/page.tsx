import { getActiveScoreConfig, getWorkspaceSettings } from "@shorts-os/db";
import { parseThresholds, parseWeights } from "@shorts-os/domain";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { env, flagsFor } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const { settings, scoreConfig } = await context.run(async ({ db }) => ({
    settings: await getWorkspaceSettings(db, workspace.id),
    scoreConfig: await getActiveScoreConfig(db, workspace.id),
  }));

  const { resolved } = flagsFor(settings?.featureFlags);
  const weights = scoreConfig ? parseWeights(scoreConfig.weights) : null;
  const thresholds = scoreConfig ? parseThresholds(scoreConfig.thresholds) : null;
  const providers = context.registry.availability();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-black">Settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          연동 상태, Feature Flag, 점수 기준입니다. Phase에 도달하지 않은 기능은 켤 수 없도록 잠겨
          있습니다.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-base font-bold">실행 모드</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[11px] tracking-widest text-muted-foreground">
              APP_MODE
            </dt>
            <dd className="mt-1 text-sm font-bold">{env().APP_MODE}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] tracking-widest text-muted-foreground">AUTH</dt>
            <dd className="mt-1 text-sm font-bold">{env().AUTH_PROVIDER}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] tracking-widest text-muted-foreground">
              시간대 · 통화
            </dt>
            <dd className="mt-1 text-sm font-bold">
              {workspace.timezone} · {settings?.defaultCurrency ?? "USD"}
            </dd>
          </div>
        </dl>
        {env().APP_MODE === "demo" && (
          <p className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-2 text-[12px] leading-relaxed">
            Demo Mode입니다. 외부 API Key 없이 Mock Provider로 동작하며, 저장되는 신호는 실제
            응답과 같은 형태입니다. YOUTUBE_API_KEY와 APP_MODE=live를 설정하면 같은 코드가 실제
            데이터로 바뀝니다.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-base font-bold">Provider 연동</h2>
        <ul className="mt-3 divide-y divide-border/60">
          {providers.map((provider) => (
            <li key={provider.provider} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-40 font-mono text-[12px]">{provider.provider}</span>
              <span
                className={
                  provider.available
                    ? "rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success"
                    : "rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px] font-bold text-muted-foreground"
                }
              >
                {provider.mode}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                {provider.requirement ?? "사용 가능합니다."}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-base font-bold">Feature Flag</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {resolved.map((flag) => (
            <li key={flag.key} className="flex items-center gap-2 text-[12px]">
              <span
                className={
                  flag.enabled ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground/40"
                }
              />
              <span className="font-mono">{flag.key}</span>
              <span className="text-muted-foreground">
                {flag.enabled ? "on" : "off"}
                {flag.lockedReason ? " · 현재 Phase에서 잠김" : ` · ${flag.source}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {weights && thresholds && (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">점수 기준</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              v{scoreConfig?.version} · {scoreConfig?.name}
            </span>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(weights).map(([key, weight]) => (
              <li key={key} className="flex items-center justify-between text-[12px]">
                <span className="font-mono text-muted-foreground">{key}</span>
                <span className="font-mono font-bold">{weight}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted-foreground">
            제작 후보 기준 {thresholds.produce_score}점, 관찰 기준 {thresholds.watch_score}점, 제작
            후보 최소 신뢰도 {thresholds.minimum_produce_confidence}입니다. 기준을 바꾸면 새 버전이
            생기고 과거 Snapshot은 그대로 남습니다.
          </p>
        </section>
      )}
    </div>
  );
}
