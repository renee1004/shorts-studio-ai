"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { RenderSpec } from "@/lib/render-spec";
import { specFileName } from "@/lib/render-spec";
import {
  decodeAudioFile,
  isBrowserRenderSupported,
  renderShortInBrowser,
  type RenderStatus,
} from "@/lib/browser-render";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/meter";

type Result = { url: string; name: string; sizeMb: string; seconds: number; codec: string };

export function BrowserRender({ spec }: { spec: RenderSpec }) {
  const [audio, setAudio] = useState<{ file: File; buffer: AudioBuffer } | null>(null);
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const supported = isBrowserRenderSupported();
  const scriptSeconds = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const audioGap = audio ? audio.buffer.duration - scriptSeconds : 0;

  async function pickAudio(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const buffer = await decodeAudioFile(file);
      setAudio({ file, buffer });
      toast.success(`음성 ${buffer.duration.toFixed(1)}초를 불러왔습니다`);
    } catch (cause) {
      setAudio(null);
      setError(cause instanceof Error ? cause.message : "오디오를 읽지 못했습니다.");
    }
  }

  async function render() {
    setError(null);
    setResult(null);
    setStatus({ label: "시작하는 중", percent: 0 });

    try {
      const output = await renderShortInBrowser({
        spec,
        audioBuffer: audio?.buffer ?? null,
        onStatus: setStatus,
      });

      const name = specFileName(spec.title).replace(/-spec\.json$/, `.${output.extension}`);
      setResult({
        url: URL.createObjectURL(output.blob),
        name,
        sizeMb: (output.blob.size / 1024 / 1024).toFixed(1),
        seconds: output.seconds,
        codec: output.codec,
      });
      toast.success("영상이 완성됐습니다", { description: "바로 재생하거나 내려받으세요." });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "영상을 만들지 못했습니다.");
    } finally {
      setStatus(null);
    }
  }

  const busy = status !== null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-5 sm:p-6">
      <h3 className="text-balance-ko text-base font-bold">
        브라우저에서 바로 만들기
        <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 align-middle text-[10px] font-bold text-primary">
          명령어 없음
        </span>
      </h3>
      <p className="mt-2 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
        이 화면에서 영상 파일까지 만들어집니다. 설치할 것도, 서버로 올라가는 것도 없습니다. 음성
        파일을 넣으면 함께 합쳐지고, 넣지 않으면 무음으로 만들어집니다.
      </p>

      {!supported ? (
        <p className="mt-4 rounded-xl border border-destructive/35 bg-destructive/[0.07] px-4 py-3 text-balance-ko text-[13px] leading-relaxed">
          이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 크롬이나 엣지 최신 버전에서
          열거나, 아래 &lsquo;컴퓨터에서 명령으로 만들기&rsquo;를 쓰세요. 아이폰 사파리는 아직
          지원하지 않습니다.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => void pickAudio(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              className="h-9 px-4"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {audio ? "음성 바꾸기" : "내레이션 음성 넣기 (선택)"}
            </Button>
            <Button className="h-9 px-5 font-bold" disabled={busy} onClick={() => void render()}>
              {busy ? "만드는 중" : "영상 만들기"}
            </Button>
            {audio && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {audio.file.name} · {audio.buffer.duration.toFixed(1)}초
              </span>
            )}
          </div>

          {audio && Math.abs(audioGap) > 1.5 && (
            <p className="mt-3 text-balance-ko text-[12.5px] leading-relaxed text-muted-foreground">
              음성이 대본보다 {Math.abs(audioGap).toFixed(1)}초 {audioGap > 0 ? "깁니다" : "짧습니다"}.
              {audioGap > 0
                ? " 소리가 잘리지 않게 마지막 구간을 늘려서 만듭니다. 구간 초를 다시 맞추면 더 자연스럽습니다."
                : " 뒷부분이 무음으로 남습니다. 구간 초를 줄이면 맞습니다."}
            </p>
          )}

          {status && (
            <div className="mt-4">
              <Meter value={status.percent} className="h-2" label="렌더링 진행률" />
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {status.label} · {status.percent}%
              </p>
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl border border-success/35 bg-success/[0.06] p-4">
              <p className="text-[13px] font-bold">
                완성 · {result.seconds.toFixed(1)}초 · {result.sizeMb}MB
              </p>
              <video
                src={result.url}
                controls
                className="mt-3 aspect-[9/16] w-full max-w-[220px] rounded-xl border border-border/70 bg-black"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={result.url}
                  download={result.name}
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
                >
                  {result.name} 내려받기
                </a>
              </div>
              <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
                코덱 {result.codec} · {spec.width}×{spec.height}
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/35 bg-destructive/[0.07] px-4 py-3 text-balance-ko text-[13px] leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
