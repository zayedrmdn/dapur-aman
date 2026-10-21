/* eslint-disable @typescript-eslint/no-require-imports -- Isolated test loader compiles server modules with the installed TypeScript compiler. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === "server-only" ? {} : originalLoad.call(this, name, ...args); };
require.extensions[".ts"] = (module, name) => module._compile(ts.transpileModule(fs.readFileSync(name, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, name);
const { staffApi } = require("../lib/staff-api.ts");
const { NextRequest } = require("next/server");
process.env.SESSION_SECRET = "synthetic-test-session-signing-key-32-characters";
process.env.BACKEND_URL = "http://127.0.0.1:8765";
process.env.BACKEND_SHARED_SECRET = "synthetic-local-secret";
process.env.NODE_ENV = "production";
const origin = "http://localhost:3123";
function request(path, cookie, data, headers = {}) {
  const multipart = data instanceof FormData;
  return new NextRequest(`${origin}/api/staff/${path}`, {
    method: data ? "POST" : "GET",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data ? { Origin: origin, Host: new URL(origin).host } : {}), ...(data && !multipart ? { "Content-Type": "application/json" } : {}), ...headers },
    body: data ? (multipart ? data : JSON.stringify(data)) : undefined,
  });
}
function photo(batchId, fail = false) {
  const data = new FormData();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
  data.set("photo", new File([bytes], "test.png", { type: "image/png" }));
  data.set("table_name", "Meja pengujian"); data.set("menu_items", fail ? "FAIL" : "Nasi, ayam, sayur");
  if (batchId) { data.set("batch_id", batchId); data.set("is_retake", "true"); }
  return data;
}
test("sessions, CSRF and missing configuration fail closed", async () => {
  assert.equal((await staffApi(request("overview"), "overview")).status, 401);
  assert.equal((await staffApi(request("overview", "dapur_session=forged"), "overview")).status, 401);
  assert.equal((await staffApi(request("login", null, { username: "local_staff", password: "wrong" }, { Origin: "https://evil.example" }), "login")).status, 403);
  const previous = process.env.SESSION_SECRET; process.env.SESSION_SECRET = "";
  assert.equal((await staffApi(request("overview"), "overview")).status, 503);
  process.env.SESSION_SECRET = previous;
});
test("isolated HTTP journey: login, three agents, action, retake, failure and logout", async () => {
  assert.equal((await staffApi(request("login", null, { username: "local_staff", password: "wrong" }), "login")).status, 401);
  const login = await staffApi(request("login", null, { username: "local_staff", password: "local-test-password" }), "login");
  assert.equal(login.status, 200);
  const header = login.headers.get("set-cookie");
  assert.match(header, /HttpOnly/i); assert.match(header, /Secure/i); assert.match(header, /SameSite=strict/i);
  const cookie = header.split(";")[0];
  assert.equal((await staffApi(request("supervisor/dashboard", cookie), "supervisor/dashboard")).status, 404);
  const inspection = await staffApi(request("inspect", cookie, photo()), "inspect");
  const result = await inspection.json();
  assert.equal(inspection.status, 200, JSON.stringify(result)); assert.equal(result.status, "review_required");
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding.run_id, result.run_id); assert.equal(finding.photo_id, result.photo_id);
  assert.equal(finding.rule_reference, "rule-table-v1:foreign-01");
  const batchPath = `batches/${result.batch_id}`, eventsPath = `runs/${result.run_id}/events`;
  const events = await (await staffApi(request(eventsPath, cookie), eventsPath)).json();
  for (const agent of ["vision", "compliance", "orchestrator"]) assert.ok(events.events.some(event => event.agent === agent));
  assert.ok(events.events.some(event => event.step === "lookup_rules"));
  assert.equal((await staffApi(request("actions", cookie, { batch_id: result.batch_id, finding_id: finding.id, action: "on_hold", reason: "Wrong role" }), "actions")).status, 400);
  const action = await staffApi(request("actions", cookie, { batch_id: result.batch_id, finding_id: finding.id, action: "fixed", reason: "Synthetic correction", actor_id: "supervisor" }), "actions");
  assert.equal(action.status, 200); assert.equal((await action.json()).actor_id, "test_staff");
  const saved = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  assert.equal(saved.findings[0].state, "fixed"); assert.equal(saved.actions[0].reason, "Synthetic correction");
  const refreshed = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  assert.notEqual(refreshed.findings[0].photo_url, saved.findings[0].photo_url);
  const retake = await staffApi(request("inspect", cookie, photo(result.batch_id)), "inspect");
  const repeated = await retake.json(); assert.equal(retake.status, 200); assert.equal(repeated.is_retake, true);
  assert.notEqual(repeated.photo_id, result.photo_id);
  const after = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  assert.equal(after.findings.find(item => item.id === finding.id).photo_id, result.photo_id);
  const failed = await staffApi(request("inspect", cookie, photo(result.batch_id, true)), "inspect");
  assert.equal(failed.status, 502); assert.equal((await failed.json()).detail.batch_id, result.batch_id);
  const overview = await (await staffApi(request("overview", cookie), "overview")).json();
  assert.equal(overview.packing_photos.find(item => item.batch_id === result.batch_id).status, "retake_required");
  const logout = await staffApi(request("logout", cookie, {}), "logout");
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  console.log("Verified real Next handlers + FastAPI + SQLAlchemy + three ADK agents/tools; scripted model, memory-only storage.");
});
