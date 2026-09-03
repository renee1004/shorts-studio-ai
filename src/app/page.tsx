import { Suspense } from "react";
import { deviceRoles, realityChecks, steps, totalMinutes } from "@/lib/content";
import { ProgressTransfer } from "@/components/progress-transfer";
import { PipelineMap } from "@/components/pipeline-map";
import { PrepChecklist } from "@/components/prep-checklist";
import { OverallStatus } from "@/components/overall-status";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 px-5 py-10 sm:px-10 sm:py-14">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative">
          <Badge
            variant="outline"
            className="border-primary/35 bg-primary/10 text-primary"
          >
            무료 · 결제 없이 끝까지
          </Badge>
          <h1 className="mt-5 text-balance-ko text-3xl font-black leading-[1.2] sm:text-5xl">
            NotebookLM 하나로
            <br />
            쇼츠 제작 파이프라인 만들기
          </h1>
          <p className="mt-5 max-w-2xl text-balance-ko text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            도구를 여러 개 옮겨 다니지 않습니다. 리서치, 니치 선정, 채널 설계, 대본, 영상 생성까지
            노트북 한 곳에서 처리하는 순서를 5단계로 나눴습니다. 각 단계에는 클릭할 위치와 복사해서
            쓰는 프롬프트, 그리고 무료 플랜에서 실제로 막히는 지점까지 적어뒀습니다.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <LinkButton href={`/steps/${steps[0].slug}`} size="lg" className="font-bold">
              1단계부터 시작하기
            </LinkButton>
            <LinkButton href="/prompts" size="lg" variant="outline">
              프롬프트만 먼저 보기
            </LinkButton>
          </div>

          <dl className="mt-9 grid max-w-xl grid-cols-3 gap-4 border-t border-border/70 pt-6">
            {[
              { label: "단계", value: `${steps.length}개` },
              { label: "예상 소요", value: `약 ${Math.round(totalMinutes / 60)}시간` },
              { label: "제작 비용", value: "0원" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-mono text-[11px] tracking-wide text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-xl font-black sm:text-2xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-12">
        <OverallStatus />
      </section>

      <section className="mt-12">
        <PrepChecklist />
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-bold sm:text-2xl">세 기기에서 나눠 쓰는 법</h2>
        <p className="mt-2 max-w-2xl text-balance-ko text-sm text-muted-foreground">
          인터넷만 있으면 어디서든 진행됩니다. 다만 영상 렌더링은 컴퓨터에서만 돌아가니, 기기별로
          역할을 나눠두면 이동 중에도 작업이 끊기지 않습니다.
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {deviceRoles.map((item) => (
            <li key={item.device} className="rounded-2xl border border-border/70 bg-card p-5">
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                {item.device}
              </p>
              <h3 className="mt-2 text-[15px] font-bold">{item.role}</h3>
              <p className="mt-2 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Suspense
            fallback={<div className="h-56 rounded-2xl border border-border/70 bg-card/60" />}
          >
            <ProgressTransfer />
          </Suspense>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-bold sm:text-2xl">5단계 전체 흐름</h2>
        <p className="mt-2 max-w-2xl text-balance-ko text-sm text-muted-foreground">
          위에서 아래로 순서대로 진행하세요. 앞 단계의 결과물이 다음 단계의 입력값이 되도록
          설계되어 있어서, 건너뛰면 뒤에서 답변 품질이 떨어집니다.
        </p>
        <div className="mt-5">
          <PipelineMap />
        </div>
      </section>

      <section className="mt-14 mb-16">
        <h2 className="text-xl font-bold sm:text-2xl">시작 전에 알아야 할 현실</h2>
        <p className="mt-2 max-w-2xl text-balance-ko text-sm text-muted-foreground">
          기대치를 정확히 맞춰야 중간에 그만두지 않습니다. 아래 네 가지는 이 파이프라인의 한계와
          가능성입니다.
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {realityChecks.map((check) => (
            <li
              key={check.title}
              className={cn(
                "rounded-2xl border p-5",
                check.tone === "warn"
                  ? "border-destructive/30 bg-destructive/[0.06]"
                  : "border-success/30 bg-success/[0.05]",
              )}
            >
              <h3 className="flex items-start gap-2 text-balance-ko text-[15px] font-bold leading-snug">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 font-mono text-xs",
                    check.tone === "warn" ? "text-destructive" : "text-success",
                  )}
                >
                  {check.tone === "warn" ? "주의" : "효과"}
                </span>
                {check.title}
              </h3>
              <p className="mt-2.5 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                {check.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
