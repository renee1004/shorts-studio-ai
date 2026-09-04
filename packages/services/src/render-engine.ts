import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildAssCaptions, parseEbur128Integrated } from "@shorts-os/domain";
import type { RenderManifest } from "@shorts-os/contracts";

export type RenderEngineResult = {
  outputPath: string;
  checksumSha256: string;
  byteSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  loudnessLufs: number | null;
  probe: Record<string, unknown>;
};

export function mediaRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_ROOT ?? ".data/media");
}

export function assetFilePath(workspaceId: string, assetId: string, ext = "mp4"): string {
  return path.join(mediaRoot(), workspaceId, "assets", `${assetId}.${ext}`);
}

export function renderOutputPath(workspaceId: string, renderId: string): string {
  return path.join(mediaRoot(), workspaceId, "renders", renderId, "out.mp4");
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export function runCommand(
  command: string,
  args: string[],
  options: { captureStderr?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(options.captureStderr ? stderr : stderr.split("\n").slice(-30).join("\n")));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runCommand("ffmpeg", ["-version"]);
    await runCommand("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function probeMedia(filePath: string): Promise<{
  durationSeconds: number;
  width: number;
  height: number;
  codec: string | null;
}> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,codec_name:format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number; codec_name?: string }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  return {
    durationSeconds: Number.parseFloat(parsed.format?.duration ?? "0"),
    width: stream?.width ?? 0,
    height: stream?.height ?? 0,
    codec: stream?.codec_name ?? null,
  };
}

export async function measureLoudness(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await runCommand(
      "ffmpeg",
      ["-i", filePath, "-filter_complex", "ebur128", "-f", "null", "-"],
      { captureStderr: true },
    );
    return parseEbur128Integrated(stderr);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    return parseEbur128Integrated(text);
  }
}

const PALETTE = ["0x1d1b2e", "0x241a20", "0x16212b", "0x231e15", "0x1a2321"];

/** 글자 없는 단색 클립. 자막은 최종 mux에서만 태운다. */
export async function writePlaceholderClip(options: {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  colorIndex: number;
}): Promise<void> {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const color = PALETTE[options.colorIndex % PALETTE.length];
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=${options.width}x${options.height}:d=${options.durationSeconds}:r=${options.fps}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=channel_layout=stereo:sample_rate=44100:d=${options.durationSeconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-shortest",
    options.outputPath,
  ]);
}

export async function composeRender(options: {
  renderId: string;
  workspaceId: string;
  manifest: RenderManifest;
  clipPaths: string[];
}): Promise<RenderEngineResult> {
  const workDir = path.join(mediaRoot(), options.workspaceId, "renders", options.renderId, "work");
  await mkdir(workDir, { recursive: true });
  const outputPath = renderOutputPath(options.workspaceId, options.renderId);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const scaled: string[] = [];
  for (const [index, clip] of options.clipPaths.entries()) {
    const shot = options.manifest.shots[index];
    if (!shot) throw new Error(`샷 ${index + 1}이 매니페스트에 없습니다.`);
    const scaledPath = path.join(workDir, `shot-${String(index).padStart(3, "0")}.mp4`);
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      clip,
      "-t",
      String(shot.durationSeconds),
      "-vf",
      `scale=${options.manifest.width}:${options.manifest.height}:force_original_aspect_ratio=increase,crop=${options.manifest.width}:${options.manifest.height}`,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-r",
      String(options.manifest.fps),
      scaledPath,
    ]);
    scaled.push(scaledPath);
  }

  const listFile = path.join(workDir, "concat.txt");
  await writeFile(
    listFile,
    scaled.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
    "utf8",
  );
  const concatPath = path.join(workDir, "concat.mp4");
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    concatPath,
  ]);

  const assPath = path.join(workDir, "captions.ass");
  const cues = options.manifest.shots.map((shot) => ({
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds,
    text: shot.onScreenText,
  }));
  await writeFile(
    assPath,
    buildAssCaptions(cues, { width: options.manifest.width, height: options.manifest.height }),
    "utf8",
  );

  const assFilter = assPath.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
  try {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      concatPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      `ass='${assFilter}'`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } catch {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      concatPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      `drawtext=text='CAPTION':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h*0.82:borderw=4`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  }

  const probe = await probeMedia(outputPath);
  const loudnessLufs = await measureLoudness(outputPath);
  const checksumSha256 = await sha256File(outputPath);
  const byteSize = (await readFile(outputPath)).byteLength;
  await rm(workDir, { recursive: true, force: true });

  return {
    outputPath,
    checksumSha256,
    byteSize,
    durationSeconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    loudnessLufs,
    probe: { ...probe, engine: "ffmpeg.post.v1", captionsInPost: true },
  };
}

export function fontsAvailable(): boolean {
  return existsSync("/usr/share/fonts") || existsSync(".cache/fonts");
}
