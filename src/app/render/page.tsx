import type { Metadata } from "next";
import { RenderStudio } from "@/components/render-studio";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = {
  title: "자동 렌더링",
  description:
    "4단계 대본 표를 붙여넣으면 세로 9:16 쇼츠 렌더 스펙과 미리보기를 만들어줍니다. 편집 프로그램 없이 FFmpeg로 mp4를 뽑습니다.",
};

export default function RenderPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-balance-ko text-2xl font-black sm:text-4xl">자동 렌더링</h1>
        <p className="mt-4 text-balance-ko text-[15px] leading-relaxed text-muted-foreground">
          CapCut에는 영상을 자동으로 뽑아주는 공개 API가 없습니다. 그래서 편집 프로그램에 시키려던
          일(세로 캔버스, 구간별 자막, 내레이션 합치기, mp4 출력)을 FFmpeg로 대신합니다. 무료이고,
          설치할 앱이 없고, 같은 대본이면 항상 같은 결과가 나옵니다.
        </p>
        <p className="mt-3 text-balance-ko text-[15px] leading-relaxed text-muted-foreground">
          여기서 만드는 건 &lsquo;렌더 스펙&rsquo;이라는 작은 JSON 파일입니다. 모바일에서 대본을
          붙여넣고 스펙만 만들어 두었다가, 컴퓨터에서 명령 한 줄로 영상을 뽑는 흐름을 염두에 두고
          만들었습니다.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href="/sample-short.mp4"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
          >
            예시 결과물 보기 (50초)
          </a>
          <LinkButton href="/steps/script-dna" variant="outline" size="sm">
            대본이 없다면 4단계로
          </LinkButton>
          <LinkButton href="/steps/studio-render" variant="ghost" size="sm">
            5단계 설명 보기
          </LinkButton>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          아래 예시 대본을 그대로 렌더링한 파일입니다. 자막 크기와 화면 여백이 실제로 어떻게
          나오는지 먼저 확인해 보세요.
        </p>
      </header>

      <div className="mt-10">
        <RenderStudio />
      </div>
    </div>
  );
}
