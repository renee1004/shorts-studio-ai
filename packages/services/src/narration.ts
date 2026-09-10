import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "@shorts-os/domain";
import {
  insertMediaAsset,
  listMediaAssetsForProject,
  type Database,
} from "@shorts-os/db";
import { mediaRoot, runCommand, probeMedia, sha256File } from "./render-engine";

export type NarrationShot = {
  startSeconds: number | string;
  endSeconds: number | string;
  narration: string | null;
};
export function narrationFingerprint(shots: NarrationShot[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        shots.map((s) => ({
          start: Number(s.startSeconds),
          end: Number(s.endSeconds),
          text: s.narration,
        })),
      ),
    )
    .digest("hex");
}
export function narrationTempo(duration: number, slot: number): number {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(slot) ||
    slot <= 0
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "음성 길이를 확인할 수 없습니다.",
    );
  const rate = Math.max(1.3, duration / slot);
  if (rate > 1.5)
    throw new DomainError(
      "VALIDATION_FAILED",
      "내레이션이 장면보다 깁니다. 대본을 줄이거나 장면 시간을 늘려 주세요. 말을 잘라내지 않았습니다.",
    );
  return rate;
}
export async function findNarration(
  db: Database,
  workspaceId: string,
  projectId: string,
  shots: NarrationShot[],
) {
  const fingerprint = narrationFingerprint(shots);
  return (
    (await listMediaAssetsForProject(db, workspaceId, projectId)).find(
      (asset) =>
        asset.assetType === "voice" &&
        asset.status === "succeeded" &&
        (asset.generationParameters as Record<string, unknown>)
          .narrationFingerprint === fingerprint,
    ) ?? null
  );
}
export async function generateNarration(options: {
  db: Database;
  workspaceId: string;
  projectId: string;
  shots: NarrationShot[];
  model: string;
  voice: string;
  provider: { synthesize(text: string): Promise<Buffer> };
}) {
  if (
    !options.shots.length ||
    options.shots.some((shot) => !shot.narration?.trim())
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "모든 장면에 내레이션을 입력해 주세요.",
    );
  const existing = await findNarration(
    options.db,
    options.workspaceId,
    options.projectId,
    options.shots,
  );
  const savedSettings = existing?.generationParameters as
    Record<string, unknown> | undefined;
  if (
    existing?.storageUri &&
    savedSettings?.model === options.model &&
    savedSettings?.voice === options.voice
  ) {
    try {
      if ((await sha256File(existing.storageUri)) === existing.checksumSha256)
        return existing;
    } catch {
      /* Regenerate from saved shot audio if file is missing. */
    }
  }
  const fingerprint = narrationFingerprint(options.shots);
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        fingerprint,
        model: options.model,
        voice: options.voice,
        version: 1,
      }),
    )
    .digest("hex");
  const dir = path.join(
    mediaRoot(),
    options.workspaceId,
    "narration",
    options.projectId,
    cacheKey,
  );
  await mkdir(dir, { recursive: true });
  const parts: string[] = [];
  let previousEnd = 0;
  for (const [index, shot] of options.shots.entries()) {
    const start = Number(shot.startSeconds),
      end = Number(shot.endSeconds);
    if (start !== previousEnd || end <= start)
      throw new DomainError(
        "VALIDATION_FAILED",
        "음성 생성에는 빈 구간 없이 이어지는 장면이 필요합니다.",
      );
    previousEnd = end;
    const raw = path.join(dir, `${index}.wav`);
    try {
      await readFile(raw);
    } catch {
      const bytes = await options.provider.synthesize(shot.narration!);
      const temp = `${raw}.${randomUUID()}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, raw);
    }
    const trimmed = path.join(dir, `${index}-trimmed.wav`);
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      raw,
      "-af",
      "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB,areverse",
      trimmed,
    ]);
    const duration = (await probeMedia(trimmed)).durationSeconds;
    const tempo = narrationTempo(duration, end - start);
    const fitted = path.join(dir, `${index}-fitted.wav`);
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      trimmed,
      "-af",
      `atempo=${tempo},apad`,
      "-t",
      String(end - start),
      "-ar",
      "24000",
      "-ac",
      "1",
      fitted,
    ]);
    parts.push(fitted);
  }
  if (!parts.length)
    throw new DomainError(
      "VALIDATION_FAILED",
      "내레이션을 만들 장면이 없습니다.",
    );
  const list = path.join(dir, "parts.txt");
  await writeFile(
    list,
    parts.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
  );
  const output = path.join(dir, "voice.wav");
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-ar",
    "24000",
    "-ac",
    "1",
    output,
  ]);
  return insertMediaAsset(options.db, {
    workspaceId: options.workspaceId,
    contentProjectId: options.projectId,
    assetType: "voice",
    provider: "gemini_tts",
    storageUri: output,
    mimeType: "audio/wav",
    byteSize: (await stat(output)).size,
    checksumSha256: await sha256File(output),
    status: "succeeded",
    generationParameters: {
      narrationFingerprint: fingerprint,
      model: options.model,
      voice: options.voice,
      durationSeconds: previousEnd,
      tempoRange: [1.3, 1.5],
    },
    rightsMetadata: { origin: "AI generated narration", reviewRequired: true },
  });
}
