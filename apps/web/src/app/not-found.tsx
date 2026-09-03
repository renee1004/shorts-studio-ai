import { LinkButton } from "@/components/link-button";
import { steps } from "@/lib/content";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="font-mono text-sm tracking-widest text-muted-foreground">404</span>
      <h1 className="mt-4 text-balance-ko text-2xl font-black sm:text-3xl">
        없는 페이지입니다
      </h1>
      <p className="mt-3 text-balance-ko text-sm leading-relaxed text-muted-foreground">
        주소가 바뀌었거나 잘못 입력된 것 같습니다. 아래에서 원하는 단계로 바로 이동하세요.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <LinkButton href="/playbook">전체 흐름으로</LinkButton>
        {steps.map((step) => (
          <LinkButton
            key={step.slug}
            href={`/playbook/steps/${step.slug}`}
            variant="outline"
            size="sm"
          >
            {step.order}단계 {step.title}
          </LinkButton>
        ))}
      </div>
    </div>
  );
}
