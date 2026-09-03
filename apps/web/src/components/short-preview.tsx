"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/render-spec";
import { scenePalette, wrapCaption } from "@/lib/render-spec";
import { Button } from "@/components/ui/button";

export function ShortPreview({
  scenes,
  index,
  onIndexChange,
  accent,
  watermark,
}: {
  scenes: Scene[];
  index: number;
  onIndexChange: (index: number) => void;
  accent: string;
  watermark: string;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const elapsedBefore = scenes.slice(0, index + 1).reduce((sum, scene) => sum + scene.duration, 0);
  const scene = scenes[index];

  useEffect(() => {
    if (!playing || !scene) return;
    timer.current = setTimeout(
      () => {
        if (index < scenes.length - 1) onIndexChange(index + 1);
        else setPlaying(false);
      },
      scene.duration * 1000,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, index, scene, scenes.length, onIndexChange]);

  if (!scene) return null;

  const [c0, c1] = scenePalette[index % scenePalette.length]!;
  const lines = wrapCaption(scene.caption);
  const fontClass =
    lines.length >= 3 ? "text-[5.4vw] sm:text-2xl" : lines.length === 2 ? "text-[6vw] sm:text-[28px]" : "text-[6.6vw] sm:text-3xl";

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border border-border/70 shadow-2xl"
        style={{ background: `linear-gradient(160deg, ${c0}, ${c1})` }}
      >
        <div
          className="absolute top-0 left-0 h-1.5 transition-[width] duration-300"
          style={{ width: `${(elapsedBefore / total) * 100}%`, background: accent }}
        />
        {watermark && (
          <span className="absolute top-5 left-4 text-[11px] font-medium text-white/55">
            {watermark}
          </span>
        )}

        <div className="absolute inset-x-4 top-1/2 -translate-y-[53%] text-center">
          <span
            className="mx-auto mb-3 block h-[3px] w-8 rounded-full"
            style={{ background: accent }}
          />
          {lines.map((line, lineIndex) => (
            <p
              key={lineIndex}
              className={`font-black leading-[1.32] text-white ${fontClass}`}
              style={{ textShadow: "0 3px 10px rgba(0,0,0,0.65)" }}
            >
              {line}
            </p>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
          <span className="font-mono text-[10px] text-white/65">
            {index + 1}/{scenes.length} · {scene.duration}초
          </span>
          <span className="font-mono text-[10px] text-white/45">1080×1920</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-3"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
        >
          이전
        </Button>
        <Button size="sm" className="h-8 px-4" onClick={() => setPlaying((v) => !v)}>
          {playing ? "정지" : "타이밍 재생"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-3"
          disabled={index === scenes.length - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          다음
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        실제 구간 길이대로 넘어갑니다. 자막이 눈으로 따라갈 수 있는 속도인지 확인하세요.
      </p>
    </div>
  );
}
