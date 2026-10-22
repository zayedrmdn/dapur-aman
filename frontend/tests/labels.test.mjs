import { test } from "node:test";
import assert from "node:assert/strict";
import { runErrorLabel } from "../lib/labels.ts";
test("failed runs explain the stage that failed, not a generic message", () => {
  assert.match(runErrorLabel({ code: "run_timeout", stage: "timeout" }), /^Inspeksi melewati batas waktu\./);
  assert.match(runErrorLabel({ code: "assessment_mismatch", stage: "validation" }), /^Jawaban model tidak sesuai/);
  assert.match(runErrorLabel({ code: "provider_not_configured", stage: "provider" }), /^Layanan model AI/);
  assert.match(runErrorLabel({ code: "something_new" }), /^Inspeksi tidak selesai\./);
  assert.match(runErrorLabel(null), /^Inspeksi tidak selesai\./);
});
