import { test } from "node:test";
import assert from "node:assert/strict";
import { PENDING_MAX_AGE, PENDING_STALE_AFTER, clearPendingInspection, isBatchId, isStale, newBatchId, readPendingInspection, savePendingInspection } from "../lib/pending-inspection.ts";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

function withBrowser(run) {
  const previous = globalThis.window;
  const events = [];
  globalThis.window = { localStorage: fakeStorage(), dispatchEvent: event => { events.push(event.type); } };
  try { return run(globalThis.window.localStorage, events); }
  finally { globalThis.window = previous; }
}

test("a new batch id is one the backend and the BFF both accept", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = newBatchId();
    assert.match(id, /^batch_[0-9a-f]{10}$/);
    assert.ok(isBatchId(id));
  }
  assert.equal(isBatchId("not a valid id"), false);
  assert.equal(isBatchId(undefined), false);
});

test("a stored inspection survives a reload and is read back unchanged", () => {
  withBrowser((storage, events) => {
    assert.equal(readPendingInspection(), null);
    const saved = savePendingInspection("batch_abc1234567", "Meja 1");
    assert.equal(storage.getItem("dapur.pending-inspection") !== null, true);
    const read = readPendingInspection();
    assert.equal(read?.batchId, "batch_abc1234567");
    assert.equal(read?.tableName, "Meja 1");
    assert.equal(read?.startedAt, saved.startedAt);
    assert.equal(events.length, 1);
    clearPendingInspection();
    assert.equal(readPendingInspection(), null);
  });
});

test("an unreadable or expired stored inspection is ignored instead of crashing", () => {
  withBrowser(storage => {
    storage.setItem("dapur.pending-inspection", "not json");
    assert.equal(readPendingInspection(), null);
    storage.setItem("dapur.pending-inspection", JSON.stringify({ batchId: "has space", startedAt: Date.now() }));
    assert.equal(readPendingInspection(), null);
    storage.setItem("dapur.pending-inspection", JSON.stringify({ batchId: "batch_abc1234567", startedAt: Date.now() - PENDING_MAX_AGE - 1000 }));
    assert.equal(readPendingInspection(), null);
    assert.equal(storage.getItem("dapur.pending-inspection"), null);
  });
});

test("an inspection becomes stale after the run limit, so a missing batch is not called working forever", () => {
  const pending = { batchId: "batch_abc1234567", tableName: "Meja 1", startedAt: Date.now() };
  assert.equal(isStale(pending), false);
  assert.equal(isStale({ ...pending, startedAt: Date.now() - PENDING_STALE_AFTER - 1000 }), true);
});
