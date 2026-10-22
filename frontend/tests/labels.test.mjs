import { test } from "node:test";
import assert from "node:assert/strict";
import { findingSubtitle, formatWib, runErrorLabel } from "../lib/labels.ts";
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
