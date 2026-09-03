import { scenePalette, wrapCaption } from "@/lib/render-spec";

export type DrawInput = {
  caption: string;
  sceneIndex: number;
  progress: number;
  accent: string;
  watermark: string;
};

/** 렌더 스크립트(FFmpeg)와 같은 화면을 캔버스에 그립니다. 둘의 결과가 어긋나면 안 됩니다. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  { caption, sceneIndex, progress, accent, watermark }: DrawInput,
  fontFamily: string,
) {
  const { width, height } = ctx.canvas;
  const [c0, c1] = scenePalette[sceneIndex % scenePalette.length];

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, c0);
  background.addColorStop(1, c1);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const lines = wrapCaption(caption);
  const fontSize = lines.length >= 3 ? 94 : lines.length === 2 ? 106 : 118;
  const lineHeight = Math.round(fontSize * 1.32);
  const blockHeight = lines.length * lineHeight;
  const blockTop = Math.round(height * 0.47 - blockHeight / 2);

  ctx.fillStyle = accent;
  ctx.fillRect((width - 120) / 2, blockTop - 64, 120, 9);

  ctx.font = `900 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  lines.forEach((line, index) => {
    const y = blockTop + index * lineHeight;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = 20;
    ctx.strokeText(line, width / 2, y);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, width / 2, y);
  });

  if (watermark) {
    ctx.font = `500 38px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(watermark, 64, 76);
  }

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, Math.round(width * Math.max(0.02, progress)), 12);
}
