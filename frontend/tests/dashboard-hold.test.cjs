/* eslint-disable @typescript-eslint/no-require-imports -- Executes the real dashboard handlers with controlled responses. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync(require.resolve("../app/dashboard/page.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const batchId = "synthetic_batch";
function dashboard(held = false) {
  return {
    batches: [{ batch_id: batchId, menu_name: "Synthetic menu", table_name: "Synthetic table", status: held ? "on_hold" : "finding_open", badge_label: held ? "On hold" : "Finding open", badge_color: "red", hold_reason: held ? "Check the tray" : null, subtitle: "Synthetic menu", photos_count: 1 }],
    active_concern: { batch_id: batchId, finding_id: "synthetic_finding", title: "foreign_object", detail: "Synthetic concern", subtitle: "", photo_url: null, box: null },
    stats: {}, schools: [], safety_feed: [],
  };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(api, held = false) {
  const state = [dashboard(held), false, "", "supervisor", "Synthetic supervisor", "all", "", false, false, true, "", { batchId, isHold: !held, placement: "active" }, "Synthetic reason"];
  const refs = [];
  let index = 0, refIndex = 0;
  const dummy = () => null;
  const react = {
    useState: initial => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useRef: value => refs[refIndex++] ??= { current: value },
    useCallback: fn => fn,
    useEffect: dummy,
    useTransition: () => [false, fn => fn()],
  };
  const testModule = { exports: {} };
  const labels = { backendLabel: x => x, batchHeading: x => x || "Synthetic batch", concernLabel: x => x, findingSubtitle: x => x };
  const load = name => name === "react" ? react : name === "react/jsx-runtime" ? require(name) : name === "next/navigation" ? { useRouter: () => ({ push: dummy }) } : name === "@/lib/contracts" ? { api, ApiError: class extends Error {}, time: x => x } : name === "@/lib/labels" ? labels : name.includes("StaffShell") ? { TechnicalDetails: dummy } : dummy;
  vm.runInNewContext(source, { require: load, module: testModule, exports: testModule.exports, Error, console, setTimeout, clearTimeout, setInterval, clearInterval });
  function nodes(node, result = []) {
    if (Array.isArray(node)) node.forEach(child => nodes(child, result));
    else if (node?.props) { result.push(node); nodes(node.props.children, result); }
    return result;
  }
  function render() { index = 0; refIndex = 0; return nodes(testModule.exports.default()); }
  return { state, render, submit: () => render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} }) };
}

test("a held active concern shows release, its reason and the actual held state", () => {
  const app = harness(async () => {}, true);
  const nodes = app.render();
  assert.ok(nodes.some(node => node.props.children === "Lepaskan tahanan"));
  assert.ok(nodes.some(node => node.props.children === "Check the tray"));
  assert.ok(!nodes.some(node => node.props.children === "Tahan batch ini"));
  assert.equal(nodes.filter(node => node.type === "form").length, 1);
});

test("confirmed hold updates the card before refresh, clears the reason and blocks duplicate submits", async () => {
  const post = deferred(), refresh = deferred();
  let posts = 0;
  const app = harness(async path => {
    if (path === "actions") { posts++; return post.promise; }
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    return refresh.promise;
  });
  const first = app.submit();
  const duplicate = app.submit();
  assert.equal(posts, 1);
  assert.equal(app.state[12], "Synthetic reason");
  post.resolve({ success: true, batch_status: "on_hold", hold_reason: "Synthetic reason", has_open_findings: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.state[0].batches[0].status, "on_hold");
  assert.equal(app.state[12], "");
  assert.ok(app.render().some(node => node.props.role === "status" && typeof node.props.children === "string" && node.props.children.includes("ditahan")));
  refresh.resolve(dashboard(true));
  await Promise.all([first, duplicate]);
});

test("failed hold keeps the entered reason and shows an inline error", async () => {
  const app = harness(async path => { if (path === "actions") throw new Error("Synthetic refusal"); });
  await app.submit();
  assert.equal(app.state[12], "Synthetic reason");
  assert.ok(app.render().some(node => node.props.role === "alert" && node.props.children === "Synthetic refusal"));
  assert.equal(app.state[0].batches[0].status, "finding_open");
});

test("an older dashboard response cannot overwrite a newer refresh", async () => {
  const old = deferred(), recent = deferred();
  let requests = 0;
  const app = harness(async path => path === "session" ? { user: { role: "supervisor", name: "Synthetic supervisor" } } : ++requests === 1 ? old.promise : recent.promise);
  const refresh = app.render().find(node => node.props.title === "Segarkan data").props.onClick;
  const first = refresh(), second = refresh();
  await new Promise(resolve => setImmediate(resolve));
  recent.resolve(dashboard(true));
  await second;
  old.resolve(dashboard(false));
  await first;
  assert.equal(app.state[0].batches[0].status, "on_hold");
});

test("confirmed release updates controls and refresh removes the hold reason", async () => {
  const app = harness(async path => {
    if (path === "actions") return { success: true, batch_status: "in_review", hold_reason: null, has_open_findings: true };
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    return dashboard(false);
  }, true);
  await app.submit();
  assert.equal(app.state[0].batches[0].status, "finding_open");
  assert.equal(app.state[0].batches[0].hold_reason, null);
  assert.ok(app.render().some(node => node.props.children === "Tahan batch"));
  assert.ok(app.render().some(node => node.props.role === "status" && typeof node.props.children === "string" && node.props.children.includes("dilepaskan")));
});

test("a failed refresh does not undo a confirmed hold or its inline confirmation", async () => {
  const app = harness(async path => {
    if (path === "actions") return { success: true, batch_status: "on_hold", hold_reason: "Synthetic reason", has_open_findings: true };
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    throw new Error("Synthetic refresh failure");
  });
  await app.submit();
  assert.equal(app.state[0].batches[0].status, "on_hold");
  assert.ok(app.render().some(node => node.props.role === "status" && typeof node.props.children === "string" && node.props.children.includes("ditahan")));
  assert.equal(app.state[2], "Synthetic refresh failure");
});

test("a refresh started before a hold cannot restore the old unheld state", async () => {
  const old = deferred();
  let requests = 0;
  const app = harness(async path => {
    if (path === "actions") return { success: true, batch_status: "on_hold", hold_reason: "Synthetic reason", has_open_findings: true };
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    return ++requests === 1 ? old.promise : dashboard(true);
  });
  const refresh = app.render().find(node => node.props.title === "Segarkan data").props.onClick();
  await app.submit();
  old.resolve(dashboard(false));
  await refresh;
  assert.equal(app.state[0].batches[0].status, "on_hold");
});

test("only a successful refresh updates the timestamp", async () => {
  let fail = false;
  const app = harness(async path => {
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    if (fail) throw new Error("Synthetic refresh failure");
    return dashboard();
  });
  const refresh = () => app.render().find(node => node.props.title === "Segarkan data").props.onClick();
  await refresh();
  const lastUpdated = app.state[10];
  assert.ok(lastUpdated);
  fail = true;
  await refresh();
  assert.equal(app.state[10], lastUpdated);
  assert.equal(app.state[2], "Synthetic refresh failure");
});

test("release confirmation remains beside the list when the held filter removes its row", async () => {
  const released = dashboard(false);
  released.active_concern = null;
  const app = harness(async path => {
    if (path === "actions") return { success: true, batch_status: "in_review", hold_reason: null, has_open_findings: true };
    if (path === "session") return { user: { role: "supervisor", name: "Synthetic supervisor" } };
    return released;
  }, true);
  app.state[0].active_concern = null;
  app.state[5] = "on_hold";
  app.state[11].placement = "list";
  await app.submit();
  assert.ok(app.render().some(node => node.props.role === "status" && typeof node.props.children === "string" && node.props.children.includes("dilepaskan")));
});
