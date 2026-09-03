import { notFound } from "next/navigation";
import { getAdjacentSteps, getStep, steps } from "@/lib/content";
import { StepRail } from "@/components/step-rail";
import { TaskList } from "@/components/task-list";
import { PromptCard } from "@/components/prompt-card";
import { StepProgressBar } from "@/components/step-progress-bar";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";

export function generateStaticParams() {
  return steps.map((step) => ({ slug: step.slug }));
}

export async function generateMetadata({ params }: PageProps<"/steps/[slug]">) {
  const { slug } = await params;
  const step = getStep(slug);
  if (!step) return { title: "찾을 수 없는 단계" };
  return {
    title: `${step.order}단계. ${step.title}`,
    description: step.summary,
  };
}

export default async function StepPage({ params }: PageProps<"/steps/[slug]">) {
  const { slug } = await params;
  const step = getStep(slug);
  if (!step) notFound();

  const { prev, next } = getAdjacentSteps(slug);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside>
          <StepRail activeSlug={step.slug} />
        </aside>

        <div className="min-w-0">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-mono">STEP {step.order}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                약 {step.minutes}분 · 할 일 {step.tasks.length}개 · 프롬프트{" "}
                {step.prompts.length}개
              </span>
            </div>
            <h1 className="mt-4 text-balance-ko text-2xl font-black leading-tight sm:text-4xl">
              {step.title}
            </h1>
            <p className="mt-3 text-balance-ko text-base font-medium text-primary sm:text-lg">
              {step.headline}
            </p>
            <p className="mt-4 max-w-3xl text-balance-ko text-[15px] leading-relaxed text-muted-foreground">
              {step.summary}
            </p>
          </header>

          <div className="mt-7">
            <StepProgressBar slug={step.slug} />
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-5">
              <h2 className="font-mono text-[11px] tracking-widest text-muted-foreground">
                시작 전 준비물
              </h2>
              <ul className="mt-3 space-y-2">
                {step.prep.map((item) => (
                  <li key={item} className="flex gap-2 text-balance-ko text-[13px] leading-relaxed">
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-5">
              <h2 className="font-mono text-[11px] tracking-widest text-primary">
                이 단계가 끝나면
              </h2>
              <p className="mt-3 text-balance-ko text-[15px] font-semibold leading-relaxed">
                {step.outcome}
              </p>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-bold sm:text-2xl">할 일 순서대로</h2>
            <p className="mt-2 text-balance-ko text-sm text-muted-foreground">
              체크는 이 브라우저에 저장되므로, 중간에 닫아도 이어서 진행할 수 있습니다.
            </p>
            <div className="mt-5">
              <TaskList tasks={step.tasks} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-bold sm:text-2xl">이 단계에서 쓰는 프롬프트</h2>
            <p className="mt-2 text-balance-ko text-sm text-muted-foreground">
              복사해서 NotebookLM 채팅창에 붙여넣으세요. 대괄호 [ ] 안은 내 내용으로 바꿔야 합니다.
            </p>
            <div className="mt-5 space-y-3">
              {step.prompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} />
              ))}
            </div>
          </section>

          <section className="mt-12 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-success/30 bg-success/[0.05] p-5">
              <h2 className="text-base font-bold">완료 기준</h2>
              <ul className="mt-3 space-y-2.5">
                {step.checkpoints.map((item) => (
                  <li key={item} className="flex gap-2.5 text-balance-ko text-[13px] leading-relaxed">
                    <span aria-hidden className="mt-0.5 shrink-0 text-success">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.05] p-5">
              <h2 className="text-base font-bold">자주 걸리는 함정</h2>
              <ul className="mt-3 space-y-4">
                {step.pitfalls.map((pitfall) => (
                  <li key={pitfall.title}>
                    <p className="text-balance-ko text-[13.5px] font-bold leading-snug">
                      {pitfall.title}
                    </p>
                    <p className="mt-1.5 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                      {pitfall.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <nav className="mt-12 mb-4 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:justify-between">
            {prev ? (
              <LinkButton href={`/steps/${prev.slug}`} variant="ghost" className="justify-start">
                ← {prev.order}단계. {prev.title}
              </LinkButton>
            ) : (
              <LinkButton href="/" variant="ghost" className="justify-start">← 전체 흐름으로</LinkButton>
            )}
            {next ? (
              <LinkButton
                href={`/steps/${next.slug}`}
                className="justify-start font-semibold sm:justify-center"
              >
                {next.order}단계. {next.title} →
              </LinkButton>
            ) : (
              <LinkButton href="/prompts" variant="outline">프롬프트 모음 보기 →</LinkButton>
            )}
          </nav>
        </div>
      </div>
    </div>
  );
}
