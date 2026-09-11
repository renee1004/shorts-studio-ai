import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:43117";
let healthy = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      healthy = true;
      break;
    }
  } catch {
    /* Server is still starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(healthy, "Web/DB health did not become ready");
const denied = await fetch(`${base}/dashboard`, { redirect: "manual" });
assert.equal(denied.status, 307);
const login = await fetch(`${base}/api/v1/auth/demo-session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "demo@shorts-os.local",
    userId: "00000000-0000-4000-8000-000000000001",
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Login must issue an HttpOnly session cookie");
for (const route of [
  "/create",
  "/import/notebooklm",
  "/dashboard",
  "/radar/niches",
  "/radar/topics",
  "/research",
  "/dna",
  "/studio",
  "/factory",
  "/runs",
  "/settings",
  "/playbook",
]) {
  const response = await fetch(`${base}${route}`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(response.status, 200, `${route} must render successfully`);
  const html = await response.text();
  assert.ok(
    !/"digest":"\d+"/.test(html),
    `${route} must not stream a server error`,
  );
  console.log(`OK ${route}`);
}
// Exercise the actual HTTP + PostgreSQL creation flow, including retries.
const workspacesResponse = await fetch(`${base}/api/v1/workspaces`, {
  headers: { cookie },
});
const workspaceId = (await workspacesResponse.json()).data.workspaces[0].id;
const creationBase = `${base}/api/v1/workspaces/${workspaceId}`;
const notebookStatus = await fetch(`${creationBase}/notebooklm?action=status`, {
  headers: { cookie },
});
assert.equal(notebookStatus.status, 200);
assert.equal(notebookStatus.headers.get("cache-control"), "private, no-store");
assert.equal(
  (await notebookStatus.json()).data.configured,
  false,
  "Demo users cannot read personal Google sessions",
);
const notebookDenied = await fetch(
  `${creationBase}/notebooklm?action=notebooks`,
  { headers: { cookie } },
);
assert.equal(notebookDenied.status, 403);
async function command(path, body, expected = 200) {
  const response = await fetch(`${creationBase}/${path}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path}: ${JSON.stringify(payload.error)}`,
  );
  return payload.data;
}
const creationInput = {
  topic: "퇴근 후 책상 정리",
  operationId: crypto.randomUUID(),
};
const created = await command("creation", creationInput, 201);
const again = await command("creation", creationInput, 201);
assert.equal(again.project.id, created.project.id, "Retry must reuse project");
await command("creation", { ...creationInput, topic: "다른 주제" }, 409);
const preparePath = `projects/${created.project.id}/prepare`;
await command(preparePath, { stage: "script" }, 409);
let prepared;
for (const stage of ["research", "angles", "script"])
  prepared = await command(preparePath, { stage });
assert.ok(prepared.latestScript?.id, "Must persist a script");
assert.ok(prepared.shots.length > 0, "Must persist shot list");
assert.equal(prepared.angles.length, 3);
assert.equal(
  prepared.approvals.length,
  0,
  "Preparation must not approve or publish",
);
const resumed = await command(preparePath, { stage: "script" });
assert.equal(
  resumed.latestScript.id,
  prepared.latestScript.id,
  "Resume must not generate twice",
);
const resumePage = await fetch(`${base}/create?project=${created.project.id}`, {
  headers: { cookie },
});
assert.equal(resumePage.status, 200);
assert.ok(
  !(await resumePage.text()).includes('"digest":"'),
  "Resume page must render",
);
console.log("OK one-topic preparation, persisted stages and safe retry");
const importInput = {
  mode: "script",
  topic: "직장인 쓸모노트 대본 가져오기",
  suppliedText: "첫 번째 문장입니다.\n두 번째 문장입니다.",
  operationId: crypto.randomUUID(),
};
const [imported, duplicateImport] = await Promise.all([
  command("creation", importInput, 201),
  command("creation", importInput, 201),
]);
assert.equal(imported.project.id, duplicateImport.project.id);
assert.equal(imported.latestScript.scriptText, importInput.suppliedText);
assert.equal(imported.scripts.length, 1);
assert.equal(imported.shots.length, 2);
assert.equal(imported.approvals.length, 0);
assert.equal(imported.qa.length, 0);
await command(
  "creation",
  { ...importInput, suppliedText: "바뀐 문장\n둘째 문장" },
  409,
);
await command(
  "creation",
  { ...importInput, operationId: crypto.randomUUID(), suppliedText: "한 문단" },
  400,
);
for (const stage of ["research", "angles", "script"]) {
  const saved = await command(`projects/${imported.project.id}/prepare`, {
    stage,
  });
  assert.equal(saved.latestScript.id, imported.latestScript.id);
  assert.equal(
    saved.angles.length,
    0,
    "Imported scripts must not generate unused angles",
  );
}
const importedPage = await fetch(
  `${base}/create?project=${imported.project.id}`,
  { headers: { cookie } },
);
assert.equal(importedPage.status, 200);
const importedHtml = await importedPage.text();
assert.ok(!importedHtml.includes('"digest":"'));
assert.ok(
  importedHtml.includes("입력한 대본을 저장했습니다"),
  "Resume must show the saved script",
);
const notes = await command(
  "creation",
  {
    mode: "notes",
    topic: "정리 자료 가져오기",
    operationId: crypto.randomUUID(),
    suppliedText: "가".repeat(4000),
  },
  201,
);
assert.equal(notes.brief.status, "needs_review");
assert.equal(notes.brief.content.executiveSummary.length, 4000);
assert.equal(notes.latestScript, null);
console.log(
  "OK imported script, notes, concurrent replay and resume without regeneration",
);
const spoof = await fetch(`${base}/api/v1/auth/demo-session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "other@example.com",
    userId: "00000000-0000-4000-8000-000000000099",
  }),
});
assert.equal(
  spoof.status,
  400,
  "Demo login cannot impersonate arbitrary members",
);
const logout = await fetch(`${base}/api/v1/auth/session`, {
  method: "DELETE",
  headers: { cookie },
});
assert.equal(logout.status, 200);
assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
console.log("Webapp smoke checks passed");
