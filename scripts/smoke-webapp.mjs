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
