import { test } from "node:test";
import assert from "node:assert/strict";
import { batchHeading, findingSubtitle, formatWib, runErrorLabel } from "../lib/labels.ts";
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
