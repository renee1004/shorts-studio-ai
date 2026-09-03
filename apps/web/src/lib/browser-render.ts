import type { RenderSpec } from "@/lib/render-spec";
import { drawScene } from "@/lib/draw-scene";

const FPS = 12;

export type RenderStatus = { label: string; percent: number };

export type RenderOutput = {
  blob: Blob;
  extension: "mp4" | "webm";
  seconds: number;
  codec: string;
};

export class UnsupportedBrowserError extends Error {
  constructor() {
    super(
      "이 브라우저는 영상 인코딩을 지원하지 않습니다. 크롬이나 엣지 최신 버전에서 열거나, 컴퓨터에서 렌더 명령을 쓰세요.",
    );
    this.name = "UnsupportedBrowserError";
  }
}

export function isBrowserRenderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.VideoEncoder !== "undefined";
}

/** 캔버스에 쓸 실제 폰트 패밀리 이름. next/font가 만든 이름을 그대로 가져옵니다. */
function resolveFontFamily(): string {
  const family = getComputedStyle(document.body).fontFamily;
  return family && family.trim() !== "" ? family : "sans-serif";
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("이 브라우저에서 오디오를 읽을 수 없습니다.");

  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(
      "오디오 파일을 읽지 못했습니다. mp3, m4a, wav 형식인지 확인해 주세요.",
    );
  } finally {
    void context.close();
  }
}

export async function renderShortInBrowser({
  spec,
  audioBuffer,
  onStatus,
}: {
  spec: RenderSpec;
  audioBuffer?: AudioBuffer | null;
  onStatus?: (status: RenderStatus) => void;
}): Promise<RenderOutput> {
  if (!isBrowserRenderSupported()) throw new UnsupportedBrowserError();

  const {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    Quality,
    getFirstEncodableVideoCodec,
    getFirstEncodableAudioCodec,
  } = await import("mediabunny");

  const report = (label: string, percent: number) => onStatus?.({ label, percent });
  report("인코더 준비 중", 2);

  const width = spec.width;
  const height = spec.height;

  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], {
    width,
    height,
  });
  if (!videoCodec) throw new UnsupportedBrowserError();

  const useWebM = videoCodec === "vp8";
  const audioCodec = audioBuffer
    ? await getFirstEncodableAudioCodec(useWebM ? ["opus"] : ["aac", "opus"])
    : null;
  if (audioBuffer && !audioCodec) {
    throw new Error("이 브라우저가 오디오 인코딩을 지원하지 않습니다. 무음으로 만들거나 컴퓨터 렌더를 쓰세요.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");

  if (document.fonts?.ready) await document.fonts.ready;
  const fontFamily = resolveFontFamily();

  const output = new Output({
    format: useWebM ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: 6e6 }),
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  const audioSource = audioCodec
    ? new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 160e3 }) })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();

  const scenes = spec.scenes.map((scene) => ({ ...scene }));
  const scriptSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);

  // 오디오가 더 길면 마지막 장면을 늘려서 소리가 잘리지 않게 합니다.
  let totalSeconds = scriptSeconds;
  if (audioBuffer && audioBuffer.duration > scriptSeconds + 0.3) {
    scenes[scenes.length - 1]!.duration += audioBuffer.duration - scriptSeconds;
    totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  }

  const totalFrames = Math.max(1, Math.round(totalSeconds * FPS));
  let frame = 0;
  let elapsed = 0;

  for (const [index, scene] of scenes.entries()) {
    const sceneFrames = Math.max(1, Math.round(scene.duration * FPS));
    elapsed += scene.duration;

    drawScene(
      ctx,
      {
        caption: scene.caption,
        sceneIndex: index,
        progress: elapsed / totalSeconds,
        accent: spec.theme.accent,
        watermark: spec.watermark,
      },
      fontFamily,
    );

    for (let i = 0; i < sceneFrames; i += 1) {
      await videoSource.add(frame / FPS, 1 / FPS, { keyFrame: i === 0 });
      frame += 1;
      if (frame % 12 === 0 || frame === totalFrames) {
        report(
          `영상 만드는 중 · ${index + 1}/${scenes.length}번째 구간`,
          2 + Math.round((frame / totalFrames) * 82),
        );
        // 진행률이 화면에 반영되도록 프레임을 양보합니다.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
    }
  }

  videoSource.close();

  if (audioSource && audioBuffer) {
    report("소리 붙이는 중", 88);
    await audioSource.add(audioBuffer);
    audioSource.close();
  }

  report("파일 마무리 중", 94);
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("영상 파일을 만들지 못했습니다. 다시 시도해 주세요.");

  report("완성", 100);

  return {
    blob: new Blob([buffer], { type: useWebM ? "video/webm" : "video/mp4" }),
    extension: useWebM ? "webm" : "mp4",
    seconds: totalSeconds,
    codec: audioCodec ? `${videoCodec} + ${audioCodec}` : videoCodec,
  };
}
