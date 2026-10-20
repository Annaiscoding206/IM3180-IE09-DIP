const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRecords, validateDemoRecord } = require("../src/services/degreeAuditService");
const { optionalPlanningIdentity } = require("../src/middleware/planningIdentity");

test("only PASSED counts, later pass survives failed attempts, credits count once", () => {
  const records = [
    { course_code: "A", result: "FAILED", earned_au: 0 },
    { course_code: "A", result: "PASSED", earned_au: 3 },
    { course_code: "A", result: "PASSED", earned_au: 3 },
    { course_code: "B", result: "FAILED", earned_au: 0 },
    { course_code: "C", result: "IN_PROGRESS", earned_au: 0 },
    { course_code: "D", result: "PASSED", earned_au: "1.50" },
  ];
  const result = summarizeRecords(records);
  assert.deepEqual(result.passed_course_codes, ["A", "D"]);
  assert.equal(result.earned_au, 4.5);
  assert.equal(result.passed_attempts, 3);
  assert.equal(result.failed_attempts, 2);
  assert.equal(result.in_progress_attempts, 1);
  assert.equal(result.earned_au_complete, true);
  assert.deepEqual(summarizeRecords([...records].reverse()), result);
});
test("unknown legacy AU stays explicit; maximum known passed AU is counted once", () => {
  const records = [{ course_code: "LEGACY", result: "PASSED", earned_au: null },
    { course_code: "A", result: "PASSED", earned_au: null },
    { course_code: "A", result: "PASSED", earned_au: 3 },
    { course_code: "A", result: "PASSED", earned_au: 4 }];
  const result = summarizeRecords(records);
  assert.equal(result.earned_au, 4);
  assert.equal(result.earned_au_complete, false);
  assert.deepEqual(result.unknown_au_course_codes, ["LEGACY"]);
  assert.equal(summarizeRecords([]).earned_au_complete, true);
});
test("demo importer validates record identity, terms, results and credit amounts", () => {
  const row = { source_key: "demo:one", course_code: "A", course_title: "Demo", academic_year: "2025-2026",
    semester: 1, result: "PASSED", grade: "B", earned_au: 3 };
  assert.deepEqual(validateDemoRecord(row), row);
  for (const change of [{ source_key: "legacy:A" }, { result: "COMPLETED" }, { result: undefined }, { semester: "1" },
    { academic_year: "2025-2025" }, { academic_year: undefined }, { earned_au: -1 }, { earned_au: 3.001 },
    { result: "FAILED", earned_au: 3 }, { result: "IN_PROGRESS", earned_au: null }, { grade: "" }]) {
    assert.throws(() => validateDemoRecord({ ...row, ...change }), { status: 400 });
  }
});
test("optional catalogue identity stays anonymous for untrusted origins", () => {
  const req = { headers: { origin: "https://untrusted.example" }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { locals: {} };
  let next = false;
  optionalPlanningIdentity(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(res.locals.authenticatedStudentId, undefined);
});
