// Read-only diagnostics. Never print API keys, prompts, generated content, or raw logs.
import { spawnSync } from "node:child_process";
const compose = [
  "compose",
  "--env-file",
  ".env.docker",
  "-f",
  "compose.webapp.yml",
];
const code = `
(async () => {
 const key = process.env.GEMINI_API_KEY;
 console.log(JSON.stringify({appMode: process.env.APP_MODE === 'live' ? 'live' : 'demo', keyConfigured: Boolean(key)}, null, 2));
 for (const field of ['GEMINI_RESEARCH_MODEL','GEMINI_CONTENT_MODEL','GEMINI_TTS_MODEL','GEMINI_IMAGE_MODEL']) {
  const model = process.env[field] || (field === 'GEMINI_IMAGE_MODEL' ? 'gemini-3.1-flash-lite-image' : '');
  if (!model) { console.log(field + ': 미설정'); continue; }
  if (!/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(model)) { console.log(field + ': 모델 이름 형식 확인 필요'); continue; }
  if (!key) { console.log(field + ': ' + model + ' / 키 없음'); continue; }
  try {
   const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model), {headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
   console.log(field + ': ' + model + ' / HTTP ' + response.status);
  } catch { console.log(field + ': 연결 실패 또는 시간 초과'); }
 }
 console.log('모델 조회만 실행했습니다. 이미지 생성·과금 테스트는 하지 않았습니다.');
})();`;
const check = spawnSync(
  "docker",
  [...compose, "exec", "-T", "web", "node", "-e", code],
  { encoding: "utf8", timeout: 75_000, maxBuffer: 1024 * 1024 },
);
if (check.status !== 0) {
  console.log(
    "실행 중인 web 컨테이너에 연결하지 못했습니다. 웹앱을 시작한 뒤 다시 실행해 주세요.",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(check.stdout);
}
const logs = spawnSync(
  "docker",
  [...compose, "logs", "--no-color", "--tail", "500", "web", "worker"],
  { encoding: "utf8", timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
);
const entries = [];
for (const line of (logs.stdout ?? "").split("\n")) {
  try {
    const record = JSON.parse(line.slice(line.indexOf("{")));
    if (record.details?.provider !== "gemini") continue;
    const safe = {};
    for (const field of ["code", "requestId"])
      if (
        typeof record[field] === "string" &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(record[field])
      )
        safe[field] = record[field];
    for (const field of ["providerCode", "finishReason", "operation"])
      if (
        typeof record.details[field] === "string" &&
        /^[A-Z_a-z]{1,64}$/.test(record.details[field])
      )
        safe[field] = record.details[field];
    for (const field of [
      "httpStatus",
      "candidateCount",
      "promptTokenCount",
      "candidatesTokenCount",
      "thoughtsTokenCount",
      "totalTokenCount",
    ])
      if (typeof record.details[field] === "number")
        safe[field] = record.details[field];
    if (typeof record.details.searchGrounding === "boolean")
      safe.searchGrounding = record.details.searchGrounding;
    entries.push(safe);
  } catch {
    /* Never print unstructured provider logs. */
  }
}
console.log("최근 Gemini 오류 정보 (키·본문 제외):");
console.log(JSON.stringify(entries.slice(-15), null, 2));
console.log(
  "목록이 비어 있으면 최근 컨테이너 로그에 진단 가능한 오류가 없는 것입니다. 과거 오류가 없었다는 뜻은 아닙니다.",
);
