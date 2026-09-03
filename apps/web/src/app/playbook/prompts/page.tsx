import type { Metadata } from "next";
import { allPrompts } from "@/lib/content";
import { PromptLibrary } from "@/components/prompt-library";

export const metadata: Metadata = {
  title: "프롬프트 모음",
  description:
    "NotebookLM에 그대로 붙여넣는 쇼츠 제작 프롬프트 전체 목록. 단계별로 필터하고 검색할 수 있습니다.",
};

export default function PromptsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-balance-ko text-2xl font-black sm:text-4xl">프롬프트 모음</h1>
        <p className="mt-4 max-w-2xl text-balance-ko text-[15px] leading-relaxed text-muted-foreground">
          {allPrompts.length}개의 프롬프트를 한 화면에 모았습니다. 순서대로 쓰는 게 기본이지만,
          필요한 것만 골라 써도 됩니다. 대괄호 [ ] 안은 반드시 내 내용으로 바꿔주세요.
        </p>
      </header>

      <div className="mt-8">
        <PromptLibrary prompts={allPrompts} />
      </div>
    </div>
  );
}
