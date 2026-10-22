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
  assert.equal((await login.json()).user.role, "kitchen_staff");
  const header = login.headers.get("set-cookie");
  assert.match(header, /HttpOnly/i); assert.match(header, /Secure/i); assert.match(header, /SameSite=strict/i);
  const cookie = header.split(";")[0];
  assert.equal((await staffApi(request("supervisor/dashboard", cookie), "supervisor/dashboard")).status, 403);
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
  assert.equal((await staffApi(request("actions", cookie, { batch_id: result.batch_id, finding_id: finding.id, action: "on_hold", reason: "Wrong role" }), "actions")).status, 403);
  const fix = { batch_id: result.batch_id, finding_id: finding.id, action: "fixed", reason: "Synthetic correction", actor_id: "supervisor" };
  assert.equal((await staffApi(request("actions", cookie, fix), "actions")).status, 409);
  const retake = await staffApi(request("inspect", cookie, photo(result.batch_id)), "inspect");
  const repeated = await retake.json(); assert.equal(retake.status, 200); assert.equal(repeated.is_retake, true);
  assert.notEqual(repeated.photo_id, result.photo_id);
  const action = await staffApi(request("actions", cookie, fix), "actions");
  assert.equal(action.status, 200); assert.equal((await action.json()).actor_id, "test_staff");
  const saved = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  const savedFinding = saved.findings.find(item => item.id === finding.id);
  assert.equal(savedFinding.state, "fixed"); assert.equal(saved.actions[0].reason, "Synthetic correction");
  const refreshed = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  assert.notEqual(refreshed.findings.find(item => item.id === finding.id).photo_url, savedFinding.photo_url);
  const after = await (await staffApi(request(batchPath, cookie), batchPath)).json();
  assert.equal(after.findings.find(item => item.id === finding.id).photo_id, result.photo_id);
  const failed = await staffApi(request("inspect", cookie, photo(result.batch_id, true)), "inspect");
  assert.equal(failed.status, 424); assert.equal((await failed.json()).detail.batch_id, result.batch_id);
  const overview = await (await staffApi(request("overview", cookie), "overview")).json();
  assert.equal(overview.packing_photos.find(item => item.batch_id === result.batch_id).status, "retake_required");
  const logout = await staffApi(request("logout", cookie, {}), "logout");
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  console.log("Verified real Next handlers + FastAPI + SQLAlchemy + three ADK agents/tools; scripted model, memory-only storage.");
});
async function signIn(username) {
  const login = await staffApi(request("login", null, { username, password: "local-test-password" }), "login");
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie").split(";")[0];
}
async function act(cookie, data) {
  const response = await staffApi(request("actions", cookie, data), "actions");
  return { status: response.status, body: await response.json() };
}
test("supervisor feed, hold, lift hold and close keep role checks", async () => {
  const staff = await signIn("local_staff");
  const supervisor = await signIn("local_supervisor");
  const result = await (await staffApi(request("inspect", staff, photo()), "inspect")).json();
  const batch = result.batch_id, batchPath = `batches/${batch}`;
  const denied = await staffApi(request("supervisor/feed", staff), "supervisor/feed");
  assert.equal(denied.status, 403); assert.match((await denied.json()).detail, /supervisor/i);
  const feedResponse = await staffApi(request("supervisor/feed", supervisor), "supervisor/feed");
  assert.equal(feedResponse.status, 200);
  assert.equal((await staffApi(request("supervisor/dashboard", supervisor), "supervisor/dashboard")).status, 200);
  const feed = await feedResponse.json();
  assert.ok(feed.safety_feed.some(item => item.batch_id === batch && item.status === "open"));
  assert.ok(feed.batches.some(item => item.batch_id === batch));
  assert.equal((await act(staff, { batch_id: batch, action: "on_hold", reason: "Staff try" })).status, 403);
  assert.equal((await act(supervisor, { batch_id: batch, action: "hold", reason: "Unknown" })).status, 400);
  assert.equal((await act(supervisor, { batch_id: batch, action: "on_hold", reason: "x" })).status, 400);
  const hold = await act(supervisor, { batch_id: batch, action: "on_hold", reason: "Check the tray" });
  assert.equal(hold.status, 200, JSON.stringify(hold.body)); assert.equal(hold.body.actor_id, "test_supervisor");
  assert.equal(hold.body.batch_status, "on_hold");
  assert.equal(hold.body.hold_reason, "Check the tray");
  assert.equal((await act(supervisor, { batch_id: batch, action: "on_hold", reason: "Duplicate request" })).status, 409);
  const heldList = await (await staffApi(request("overview", staff), "overview")).json();
  assert.equal(heldList.packing_photos.find(item => item.batch_id === batch).batch_status, "on_hold");
  assert.equal(heldList.packing_photos.find(item => item.batch_id === batch).hold_reason, "Check the tray");
  assert.equal((await (await staffApi(request(batchPath, staff), batchPath)).json()).status, "on_hold");
  assert.equal((await act(staff, { batch_id: batch, action: "lift_hold", reason: "Staff try" })).status, 403);
  assert.equal((await act(supervisor, { batch_id: batch, action: "lift_hold", reason: "Tray checked" })).status, 200);
  const dispatchPath = `notifications/dispatch-report/${batch}`;
  assert.equal((await staffApi(request(dispatchPath, supervisor, {}), dispatchPath)).status, 409);
  assert.equal((await act(staff, { batch_id: batch, action: "close", reason: "Too early" })).status, 400);
  assert.equal((await act(staff, { batch_id: batch, finding_id: result.findings[0].id, action: "dismissed", reason: "Synthetic false alarm" })).status, 200);
  assert.equal((await act(staff, { batch_id: batch, action: "close", reason: "All findings handled" })).status, 200);
  assert.equal((await act(supervisor, { batch_id: batch, action: "lift_hold", reason: "Cannot reopen" })).status, 409);
  assert.equal((await (await staffApi(request(batchPath, staff), batchPath)).json()).status, "closed");
  assert.equal((await (await staffApi(request(batchPath, supervisor), batchPath)).json()).status, "closed");
  assert.equal((await staffApi(request(dispatchPath, staff, {}), dispatchPath)).status, 403);
  assert.equal((await staffApi(request(dispatchPath, supervisor, {}), dispatchPath)).status, 200);
});
test("backend auth refusals map to clear statuses", async () => {
  const { signSession } = require("../lib/session.ts");
  const ghost = signSession({ actor_id: "deleted_user", name: "Ghost", username: "ghost", role: "supervisor" }, process.env.SESSION_SECRET);
  assert.equal((await staffApi(request("supervisor/feed", `dapur_session=${ghost}`), "supervisor/feed")).status, 401);
  const staff = await signIn("local_staff");
  const previous = process.env.BACKEND_SHARED_SECRET; process.env.BACKEND_SHARED_SECRET = "wrong-synthetic-secret";
  try { assert.equal((await staffApi(request("overview", staff), "overview")).status, 503); }
  finally { process.env.BACKEND_SHARED_SECRET = previous; }
});
test("Cloud Run front-end refusals and bad invoker JSON are configuration errors", async () => {
  const http = require("node:http");
  const { signSession } = require("../lib/session.ts");
  const seen = [];
  let reply = { status: 403, type: "text/html", body: "<html>Forbidden</html>" };
  const stub = http.createServer((incoming, outgoing) => {
    seen.push(incoming.headers);
    outgoing.writeHead(reply.status, { "Content-Type": reply.type }); outgoing.end(reply.body);
  });
  await new Promise(resolve => stub.listen(0, "127.0.0.1", resolve));
  const previousUrl = process.env.BACKEND_URL;
  process.env.BACKEND_URL = `http://127.0.0.1:${stub.address().port}`;
  const cookie = `dapur_session=${signSession({ actor_id: "test_staff", name: "Staf", username: "local_staff", role: "kitchen_staff" }, process.env.SESSION_SECRET)}`;
  try {
    const html403 = await staffApi(request("overview", cookie), "overview");
    assert.equal(html403.status, 503); assert.match((await html403.json()).detail, /Cloud Run/);
    assert.equal(seen[0]["x-shared-secret"], "synthetic-local-secret"); assert.equal(seen[0].authorization, undefined);
    reply = { status: 401, type: "text/html", body: "<html>Unauthorized</html>" };
    assert.equal((await staffApi(request("login", null, { username: "local_staff", password: "x" }), "login")).status, 503);
    reply = { status: 403, type: "application/json", body: JSON.stringify({ detail: "Supervisor access required." }) };
    assert.equal((await staffApi(request("supervisor/feed", cookie), "supervisor/feed")).status, 403);
    process.env.GCP_INVOKER_CREDENTIALS = "not-json";
    const count = seen.length;
    const invalid = await staffApi(request("overview", cookie), "overview");
    assert.equal(invalid.status, 503); assert.match((await invalid.json()).detail, /GCP_INVOKER_CREDENTIALS/);
    assert.equal((await staffApi(request("login", null, { username: "local_staff", password: "x" }), "login")).status, 503);
    assert.equal(seen.length, count);
  } finally {
    delete process.env.GCP_INVOKER_CREDENTIALS;
    process.env.BACKEND_URL = previousUrl;
    await new Promise(resolve => stub.close(resolve));
  }
});
