#!/usr/bin/env node
/**
 * 렌더 스펙(JSON)을 세로 9:16 쇼츠 mp4로 만듭니다. 편집 프로그램이 필요 없습니다.
 *
 *   node scripts/render-short.mjs examples/short-spec.json
 *   node scripts/render-short.mjs my-spec.json --audio narration.mp3 --out out/ep01.mp4
 *
 * 스펙은 웹 앱의 /render 페이지에서 대본 표를 붙여넣으면 만들어집니다.
 */

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const FONT_URL =
  "https://github.com/googlefonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf";
const FONT_CACHE = ".cache/fonts/NotoSansKR-Bold.otf";

const PALETTE = [
  ["#1d1b2e", "#0e0d16"],
  ["#241a20", "#120b10"],
  ["#16212b", "#0a1016"],
  ["#231e15", "#12100a"],
  ["#1a2321", "#0b1210"],
];

function fail(message) {
  console.error(`\n오류: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.flags[key] = next;
        i += 1;
      } else {
        args.flags[key] = true;
      }
    } else {
      args.positional.push(token);
    }
  }
  return args;
}

function validateSpec(spec) {
  if (!spec || typeof spec !== "object") fail("스펙 파일이 JSON 객체가 아닙니다.");
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0)
    fail("scenes 배열이 비어 있습니다. 대본 구간이 최소 1개 필요합니다.");

  spec.scenes.forEach((scene, index) => {
    const label = `${index + 1}번째 구간`;
    if (typeof scene.caption !== "string" || scene.caption.trim() === "")
      fail(`${label}에 caption(화면 자막)이 없습니다.`);
    const duration = Number(scene.duration);
    if (!Number.isFinite(duration) || duration <= 0)
      fail(`${label}의 duration이 올바르지 않습니다. (현재: ${scene.duration})`);
    if (duration > 30) fail(`${label}의 duration이 30초를 넘습니다. 구간을 쪼개주세요.`);
  });

  const total = spec.scenes.reduce((sum, scene) => sum + Number(scene.duration), 0);
  if (total > 180) fail(`전체 길이가 ${total}초입니다. 쇼츠는 3분 이내여야 합니다.`);
  return total;
}

function wrapCaption(text, maxPerLine = 9) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxPerLine) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxPerLine) {
        lines.push(word.slice(i, i + maxPerLine));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.split("\n").slice(-25).join("\n")));
    });
  });
}

async function ensureFont(override) {
  if (override) {
    if (!existsSync(override)) fail(`지정한 폰트 파일이 없습니다: ${override}`);
    return override;
  }
  if (existsSync(FONT_CACHE)) return FONT_CACHE;

  console.log("한국어 폰트를 처음 한 번만 내려받습니다 (Noto Sans KR Bold, 약 5MB)...");
  await mkdir(path.dirname(FONT_CACHE), { recursive: true });
  const response = await fetch(FONT_URL);
  if (!response.ok)
    fail(
      `폰트를 내려받지 못했습니다 (HTTP ${response.status}). --font 옵션으로 로컬 한국어 폰트 경로를 직접 지정하세요.`,
    );
  await pipeline(response.body, createWriteStream(FONT_CACHE));
  return FONT_CACHE;
}

async function probeDuration(file) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]);
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("close", () => resolve(Number.parseFloat(out.trim())));
    child.on("error", () => resolve(Number.NaN));
  });
}

function timecode(seconds) {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const h = String(Math.floor(whole / 3600)).padStart(2, "0");
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const s = String(whole % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms).padStart(3, "0")}`;
}

async function writeSidecars(spec, outPath) {
  const base = outPath.replace(/\.mp4$/i, "");

  const narration = spec.scenes
    .map((scene) => (scene.narration ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (narration) await writeFile(`${base}.narration.txt`, `${narration}\n`, "utf8");

  let cursor = 0;
  const blocks = spec.scenes.map((scene, index) => {
    const start = cursor;
    cursor += Number(scene.duration);
    const text = (scene.narration ?? scene.caption).trim();
    return `${index + 1}\n${timecode(start)} --> ${timecode(cursor)}\n${text}\n`;
  });
  await writeFile(`${base}.srt`, `${blocks.join("\n")}`, "utf8");

  return { narration: narration ? `${base}.narration.txt` : null, srt: `${base}.srt` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = args.positional[0];

  if (!specPath || args.flags.help) {
    console.log(`사용법:
  node scripts/render-short.mjs <스펙.json> [옵션]

옵션:
  --out <경로>     결과 mp4 경로 (기본: out/<스펙 이름>.mp4)
  --audio <경로>   내레이션 오디오 파일 (mp3/m4a/wav). 없으면 무음으로 만듭니다.
  --font <경로>    한국어 폰트 파일. 없으면 Noto Sans KR을 자동으로 내려받습니다.
  --dry-run        렌더링 없이 구성만 출력합니다.`);
    process.exit(specPath ? 0 : 1);
  }

  if (!existsSync(specPath)) fail(`스펙 파일을 찾을 수 없습니다: ${specPath}`);

  let spec;
  try {
    spec = JSON.parse(await readFile(specPath, "utf8"));
  } catch (error) {
    fail(`스펙 JSON을 읽을 수 없습니다. ${error.message}`);
  }

  const totalDuration = validateSpec(spec);
  const width = spec.width ?? 1080;
  const height = spec.height ?? 1920;
  const fps = spec.fps ?? 30;
  const accent = spec.theme?.accent ?? "#ff6b3d";
  const textColor = spec.theme?.text ?? "#ffffff";
  const watermark = (spec.watermark ?? "").trim();

  const outPath =
    typeof args.flags.out === "string"
      ? args.flags.out
      : path.join("out", `${path.basename(specPath).replace(/\.json$/i, "")}.mp4`);

  console.log(`\n제목      ${spec.title ?? "(없음)"}`);
  console.log(`구간      ${spec.scenes.length}개`);
  console.log(`길이      ${totalDuration}초`);
  console.log(`해상도    ${width}x${height} @ ${fps}fps`);
  console.log(`출력      ${outPath}`);

  spec.scenes.forEach((scene, index) => {
    console.log(
      `  ${String(index + 1).padStart(2, "0")}  ${String(scene.duration).padStart(4)}초  ${scene.caption}`,
    );
  });

  if (args.flags["dry-run"]) {
    console.log("\n--dry-run 이므로 렌더링은 하지 않았습니다.\n");
    return;
  }

  const audioPath = typeof args.flags.audio === "string" ? args.flags.audio : spec.audio ?? null;
  if (audioPath && !existsSync(audioPath)) fail(`오디오 파일을 찾을 수 없습니다: ${audioPath}`);

  if (audioPath) {
    const audioDuration = await probeDuration(audioPath);
    if (Number.isFinite(audioDuration) && Math.abs(audioDuration - totalDuration) > 1.5) {
      console.log(
        `\n주의: 오디오 길이(${audioDuration.toFixed(1)}초)와 대본 길이(${totalDuration}초)가 ${Math.abs(
          audioDuration - totalDuration,
        ).toFixed(1)}초 차이 납니다. 구간 시간을 다시 맞추는 게 좋습니다.`,
      );
    }
  }

  const fontFile = await ensureFont(args.flags.font);
  const workDir = path.join(".cache", "render", String(process.pid));
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(outPath), { recursive: true });

  console.log("\n구간을 렌더링합니다...");

  const segments = [];
  let elapsed = 0;

  for (const [index, scene] of spec.scenes.entries()) {
    const duration = Number(scene.duration);
    const [c0, c1] = PALETTE[index % PALETTE.length];
    const lines = wrapCaption(scene.caption, spec.maxCharsPerLine ?? 9);
    const fontSize = lines.length >= 3 ? 94 : lines.length === 2 ? 106 : 118;
    const lineHeight = Math.round(fontSize * 1.32);
    const blockHeight = lines.length * lineHeight;
    const blockTop = Math.round(height * 0.47 - blockHeight / 2);

    const progress = Math.max(0.02, (elapsed + duration) / totalDuration);
    elapsed += duration;

    const filters = [
      `drawbox=x=(iw-120)/2:y=${blockTop - 64}:w=120:h=9:color=${accent}:t=fill`,
    ];

    // 줄마다 개별 drawtext로 그려야 각 줄이 가운데 정렬됩니다.
    for (const [lineIndex, line] of lines.entries()) {
      const textFile = path.join(workDir, `caption-${index}-${lineIndex}.txt`);
      await writeFile(textFile, line, "utf8");
      filters.push(
        `drawtext=fontfile=${fontFile}:textfile=${textFile}:fontcolor=${textColor}:fontsize=${fontSize}` +
          `:x=(w-text_w)/2:y=${blockTop + lineIndex * lineHeight}` +
          `:borderw=10:bordercolor=black@0.9:shadowcolor=black@0.55:shadowx=0:shadowy=8`,
      );
    }

    filters.push(`drawbox=x=0:y=0:w=${Math.round(width * progress)}:h=12:color=${accent}:t=fill`);

    if (watermark) {
      const markFile = path.join(workDir, "watermark.txt");
      await writeFile(markFile, watermark, "utf8");
      filters.push(
        `drawtext=fontfile=${fontFile}:textfile=${markFile}:fontcolor=white@0.55:fontsize=38:x=64:y=76`,
      );
    }

    const segment = path.join(workDir, `scene-${String(index).padStart(3, "0")}.mp4`);
    await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `gradients=s=${width}x${height}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${width}:y1=${height}:speed=0.00001:type=linear`,
      "-t",
      String(duration),
      "-r",
      String(fps),
      "-vf",
      filters.join(","),
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      segment,
    ]).catch((error) => fail(`${index + 1}번째 구간 렌더링 실패.\n${error.message}`));

    segments.push(segment);
    process.stdout.write(`  ${index + 1}/${spec.scenes.length} 완료\r`);
  }

  const listFile = path.join(workDir, "concat.txt");
  await writeFile(
    listFile,
    segments.map((file) => `file '${path.resolve(file)}'`).join("\n"),
    "utf8",
  );

  console.log("\n오디오를 붙이고 하나로 합칩니다...");

  const muxArgs = ["-y", "-f", "concat", "-safe", "0", "-i", listFile];
  if (audioPath) muxArgs.push("-i", audioPath);
  else muxArgs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  muxArgs.push(
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  );

  await run("ffmpeg", muxArgs).catch((error) => fail(`영상 합치기 실패.\n${error.message}`));

  const sidecars = await writeSidecars(spec, outPath);
  await rm(workDir, { recursive: true, force: true });

  const finalDuration = await probeDuration(outPath);
  console.log(`\n완성했습니다.`);
  console.log(`  영상        ${outPath} (${finalDuration.toFixed(1)}초)`);
  console.log(`  자막 파일   ${sidecars.srt}`);
  if (sidecars.narration) console.log(`  내레이션    ${sidecars.narration} (무료 TTS 입력용)`);
  if (!audioPath)
    console.log(
      `\n지금은 무음입니다. 내레이션 텍스트로 음성을 만든 뒤 --audio 옵션으로 다시 실행하세요.`,
    );
  console.log("");
}

main().catch((error) => fail(error.message));
