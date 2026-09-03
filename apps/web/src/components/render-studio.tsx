"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildSpec,
  parseScriptTable,
  specFileName,
  type Scene,
} from "@/lib/render-spec";
import { ShortPreview } from "@/components/short-preview";
import { BrowserRender } from "@/components/browser-render";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SAMPLE = `| 시간 | 내레이션 | 화면에 보이는 것 | 화면 자막 |
| 0-3초 | 연말정산에서 환급을 놓치는 사람은 대개 이 세 가지를 몰랐습니다. | 하락 그래프 | 13월의 월급 놓쳤다 |
| 3-15초 | 첫째, 월세 세액공제입니다. 계약자 이름과 전입신고만 맞으면 신청할 수 있습니다. | 계약서 클로즈업 | 월세 세액공제 |
| 15-30초 | 둘째, 부양가족 의료비입니다. 따로 사는 부모님도 조건을 만족하면 합산됩니다. | 영수증 더미 | 의료비 합산 |
| 30-45초 | 셋째, 지난 해도 늦지 않았습니다. 경정청구로 오 년 안의 누락분을 돌려받습니다. | 달력 되감기 | 경정청구 5년 |
| 45-50초 | 다음 편에서 홈택스 신청 화면을 순서대로 보여드립니다. | 다음 편 예고 | 다음 편, 신청 순서 |`;

const ACCENTS = ["#ff6b3d", "#ffd23d", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];

export function RenderStudio() {
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [watermark, setWatermark] = useState("");
  const [accent, setAccent] = useState<string>(ACCENTS[0]!);
  const [activeScene, setActiveScene] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const parsed = useMemo(() => parseScriptTable(raw), [raw]);

  const scenes: Scene[] = useMemo(
    () =>
      parsed.scenes.map((scene, index) =>
        overrides[index] !== undefined ? { ...scene, duration: overrides[index] as number } : scene,
      ),
    [parsed.scenes, overrides],
  );

  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const spec = useMemo(
    () => buildSpec(scenes, { title, watermark, accent }),
    [scenes, title, watermark, accent],
  );
  const specJson = useMemo(() => `${JSON.stringify(spec, null, 2)}\n`, [spec]);
  const fileName = specFileName(title);
  const command = `node scripts/render-short.mjs ${fileName}`;

  const narration = scenes
    .map((scene) => scene.narration.trim())
    .filter(Boolean)
    .join("\n");

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("복사가 차단됐습니다. 텍스트를 직접 선택해 복사하세요.");
    }
  }

  function download() {
    const blob = new Blob([specJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("스펙 파일을 내려받았습니다", {
      description: "컴퓨터에서 렌더 명령을 실행하면 mp4가 나옵니다.",
    });
  }

  function reset() {
    setRaw("");
    setOverrides({});
    setActiveScene(0);
  }

  const hasScenes = scenes.length > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
      <div className="min-w-0 space-y-8">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">1. 4단계 대본 표를 붙여넣기</h2>
            {raw !== "" && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                비우기
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-balance-ko text-sm text-muted-foreground">
            NotebookLM이 만들어준 표를 그대로 붙여넣으면 됩니다. 마크다운 표나 스프레드시트에서
            복사한 형태 모두 읽습니다.
          </p>
          <textarea
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setOverrides({});
              setActiveScene(0);
            }}
            rows={9}
            spellCheck={false}
            placeholder="| 시간 | 내레이션 | 화면에 보이는 것 | 화면 자막 |"
            className="mt-4 w-full rounded-xl border border-border bg-card px-4 py-3 font-mono text-[12.5px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
          {raw === "" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-8"
              onClick={() => setRaw(SAMPLE)}
            >
              예시 대본으로 먼저 보기
            </Button>
          )}
        </section>

        {parsed.error && (
          <p className="rounded-xl border border-destructive/35 bg-destructive/[0.07] px-4 py-3 text-balance-ko text-sm">
            {parsed.error}
          </p>
        )}

        {hasScenes && (
          <>
            <section>
              <h2 className="text-lg font-bold">2. 구간과 자막 확인</h2>
              <p className="mt-1.5 text-balance-ko text-sm text-muted-foreground">
                전체 {total}초 · {scenes.length}개 구간. 구간을 눌러 미리보기를 넘기고, 초가 틀리면
                여기서 바로 고치세요.
              </p>

              <ul className="mt-4 space-y-2">
                {scenes.map((scene, index) => (
                  <li key={index}>
                    <div
                      className={cn(
                        "rounded-xl border p-3.5 transition-colors sm:p-4",
                        index === activeScene
                          ? "border-primary/45 bg-primary/[0.07]"
                          : "border-border/70 bg-card",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveScene(index)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-[11px]">
                            {index + 1}
                          </span>
                          <span className="truncate text-sm font-bold">{scene.caption}</span>
                        </button>
                        <label className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            step={0.5}
                            value={scene.duration}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              setOverrides((prev) => ({
                                ...prev,
                                [index]: Number.isFinite(next) && next > 0 ? next : 1,
                              }));
                            }}
                            aria-label={`${index + 1}번째 구간 길이(초)`}
                            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-xs outline-none focus-visible:border-primary/60"
                          />
                          <span className="font-mono text-[11px] text-muted-foreground">초</span>
                        </label>
                      </div>
                      {scene.narration && (
                        <p className="mt-2.5 line-clamp-2 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                          {scene.narration}
                        </p>
                      )}
                      {scene.note && (
                        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">
                          화면: {scene.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold">3. 채널 표기와 색</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    영상 제목 (파일 이름에 쓰입니다)
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="연말정산 환급 3가지"
                    className="mt-2 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    화면 좌상단 표기 (선택)
                  </span>
                  <input
                    value={watermark}
                    onChange={(event) => setWatermark(event.target.value)}
                    placeholder="@내채널"
                    className="mt-2 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
              </div>
              <div className="mt-4">
                <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  강조 색
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ACCENTS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccent(color)}
                      aria-label={`강조 색 ${color}`}
                      aria-pressed={accent === color}
                      className={cn(
                        "size-8 rounded-lg border-2 transition-transform",
                        accent === color
                          ? "scale-110 border-foreground"
                          : "border-transparent hover:scale-105",
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold">4. 영상 만들기</h2>
              <p className="mt-1.5 text-balance-ko text-sm text-muted-foreground">
                두 가지 방법이 있습니다. 이 화면에서 바로 만드는 쪽이 빠르고, 명령으로 만드는 쪽은
                여러 편을 반복해서 뽑을 때 편합니다.
              </p>

              <div className="mt-4">
                <BrowserRender spec={spec} />
              </div>

              {narration && (
                <div className="mt-4 rounded-2xl border border-border/70 bg-card p-5">
                  <h3 className="text-base font-bold">음성이 아직 없다면</h3>
                  <p className="mt-2 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                    내레이션 전문을 복사해 NotebookLM의 오디오 개요나 무료 TTS에 넣어 음성 파일을
                    만든 뒤, 위에서 음성을 넣고 다시 만들면 됩니다.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 h-9 px-4"
                    onClick={() => copy(narration, "내레이션 전문을 복사했습니다")}
                  >
                    내레이션 복사
                  </Button>
                </div>
              )}

              <details className="mt-4 rounded-2xl border border-border/70 bg-card p-5">
                <summary className="cursor-pointer text-base font-bold">
                  컴퓨터에서 명령으로 만들기
                </summary>
                <p className="mt-3 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                  스펙 파일을 내려받아 프로젝트 폴더에 두고 아래 명령을 실행합니다. FFmpeg가 필요하고,
                  결과물로 mp4와 자막 파일, 내레이션 텍스트가 함께 나옵니다.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="h-9 px-4 font-semibold" onClick={download}>
                    {fileName} 내려받기
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 px-4"
                    onClick={() => copy(specJson, "스펙 JSON을 복사했습니다")}
                  >
                    스펙 JSON 복사
                  </Button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-border/70 bg-secondary/25 px-4 py-3">
                  <code className="font-mono text-[12.5px] whitespace-nowrap">{command}</code>
                </div>
                <button
                  type="button"
                  onClick={() => copy(command, "명령을 복사했습니다")}
                  className="mt-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                >
                  명령 복사
                </button>
                <p className="mt-4 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                  음성을 먼저 만들었다면{" "}
                  <code className="font-mono text-xs">--audio 파일명.mp3</code>를 뒤에 붙이세요.
                </p>
              </details>
            </section>
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        {hasScenes ? (
          <div className="space-y-4">
            <ShortPreview
              scenes={scenes}
              index={Math.min(activeScene, scenes.length - 1)}
              onIndexChange={setActiveScene}
              accent={accent}
              watermark={watermark}
            />

            {parsed.warnings.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
                <p className="flex items-center gap-2 text-[13px] font-bold">
                  확인할 점
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {parsed.warnings.length}
                  </Badge>
                </p>
                <ul className="mt-2.5 space-y-2">
                  {parsed.warnings.map((warning, index) => (
                    <li
                      key={index}
                      className="text-balance-ko text-[12.5px] leading-relaxed text-muted-foreground"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <div className="mx-auto aspect-[9/16] w-28 rounded-xl border border-border/70 bg-card/60" />
            <p className="mt-4 text-sm font-bold">미리보기가 여기 나옵니다</p>
            <p className="mt-1.5 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
              왼쪽에 대본 표를 붙여넣으면 구간별 자막이 세로 화면으로 어떻게 보이는지 바로
              확인됩니다.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
