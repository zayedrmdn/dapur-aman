import { test } from "node:test";
import assert from "node:assert/strict";
import { matchingRows, newestFirst, pickerRows } from "../lib/batch-list.ts";

const row = (batch_id, table_name, created_at, school_name = null) => ({ batch_id, table_name, summary_label: "label", status: "review_required", created_at, school_name });

const rows = [
  row("batch_old", "Meja 1", "2026-10-21T10:00:00Z"),
  row("batch_new", "Meja 3", "2026-10-21T15:00:00Z", "SDN 05 Sukajadi"),
  row("batch_middle", "Meja 2", "2026-10-21T12:00:00Z"),
];

test("the newest batch comes first, so the result a kitchen just made is at the top", () => {
  assert.deepEqual(newestFirst(rows).map(item => item.batch_id), ["batch_new", "batch_middle", "batch_old"]);
});

test("a row without a creation time keeps its place at the end", () => {
  const withoutTime = [row("batch_a", "Meja 9", null), ...rows];
  assert.deepEqual(newestFirst(withoutTime).map(item => item.batch_id), ["batch_new", "batch_middle", "batch_old", "batch_a"]);
});

test("the search finds a batch by meja, school or id", () => {
  assert.deepEqual(matchingRows(rows, "meja 2").map(item => item.batch_id), ["batch_middle"]);
  assert.deepEqual(matchingRows(rows, "sukajadi").map(item => item.batch_id), ["batch_new"]);
  assert.deepEqual(matchingRows(rows, "batch_old").map(item => item.batch_id), ["batch_old"]);
  assert.deepEqual(matchingRows(rows, "  ").length, 3);
  assert.deepEqual(matchingRows(rows, "tidak ada"), []);
});

test("the picker offers the newest batches, then any match once a search runs", () => {
  const many = [...rows, row("batch_four", "Meja 4", "2026-10-09T09:00:00Z")];
  const sorted = newestFirst(many);
  assert.deepEqual(pickerRows(matchingRows(sorted, ""), "", 3, 8).map(item => item.batch_id), ["batch_new", "batch_middle", "batch_old"]);
  assert.deepEqual(pickerRows(matchingRows(sorted, "meja 4"), "meja 4", 3, 8).map(item => item.batch_id), ["batch_four"]);
  assert.deepEqual(pickerRows(matchingRows(sorted, "meja"), "meja", 3, 2).length, 2);
});
