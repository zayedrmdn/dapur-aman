import { test } from "node:test";
import assert from "node:assert/strict";
import { activitySummary, batchHeading, findingSubtitle, formatWib, runErrorLabel } from "../lib/labels.ts";
test("known AI activity summaries read in Bahasa; unknown text is kept as it is", () => {
  assert.equal(activitySummary("orchestrator agent started."), "Orkestrator mulai bekerja.");
  assert.equal(activitySummary("inspect_photo(): Vision reported 1 observation(s)."), "Vision melaporkan 1 pengamatan.");
  assert.equal(activitySummary("check_batch_history(concern_type=foreign_object): 0 earlier finding(s) in this batch."), "0 temuan sebelumnya di batch ini.");
  assert.equal(activitySummary("lookup_rules(concern_type=foreign_object): 1 matching rule(s)."), "1 aturan cocok.");
  assert.equal(activitySummary("A model sentence nobody mapped."), "A model sentence nobody mapped.");
});
test("batches are named by meja and school, never by their raw id", () => {
  assert.equal(batchHeading("SDN 01 Merdeka • Meja 1 (450 Porsi)", "SDN 01 Merdeka"), "SDN 01 Merdeka • Meja 1 (450 Porsi)");
  assert.equal(batchHeading("Meja 2", "SDN 05 Sukajadi"), "SDN 05 Sukajadi • Meja 2");
  assert.equal(batchHeading("Meja 3", null), "Meja 3");
  assert.equal(batchHeading("", null), "Batch tanpa nama meja");
});
test("times read in WIB with one format, and finding subtitles drop the batch id", () => {
  assert.equal(formatWib(new Date(Date.UTC(2026, 9, 22, 3, 49))), "22 Okt, 10.49 WIB");
  const subtitle = findingSubtitle("batch_b840a39aab - found 22 Oct 03:49 UTC");
  assert.match(subtitle, /^Ditemukan 22 Okt, 10\.49 WIB$/);
  assert.doesNotMatch(subtitle, /batch_/);
});
test("failed runs explain the stage that failed, not a generic message", () => {
  assert.match(runErrorLabel({ code: "run_timeout", stage: "timeout" }), /^Inspeksi melewati batas waktu\./);
  assert.match(runErrorLabel({ code: "assessment_mismatch", stage: "validation" }), /^Jawaban model tidak sesuai/);
  assert.match(runErrorLabel({ code: "provider_not_configured", stage: "provider" }), /^Layanan model AI/);
  assert.match(runErrorLabel({ code: "something_new" }), /^Inspeksi tidak selesai\./);
  assert.match(runErrorLabel(null), /^Inspeksi tidak selesai\./);
});
