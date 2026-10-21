const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateProgress } = require("../src/services/curriculumService");
const { summarizeRecords } = require("../src/services/degreeAuditService");
const { matchCurriculum, evaluateCurriculumYear } = require("../src/services/curriculumRulesService");
const categories = [{ category_code: "CORE", required_au: 6 }, { category_code: "MPE", required_au: 4 }];
const groups = [{ category_code: "MPE", group_code: "OPTIONS", required_au: 4 }];
const courses = [
  { course_code: "A", category_code: "CORE", is_required: 1 },
  { course_code: "B", category_code: "CORE", is_required: 1 },
  { course_code: "C", category_code: "MPE", group_code: "OPTIONS", is_required: 0 },
  { course_code: "D", category_code: "MPE", group_code: "OPTIONS", is_required: 0 },
];
const record = (course_code, result, earned_au) => ({ course_code, result, earned_au });

test("curriculum credits use Degree Audit passed/max-credit semantics across attempts", () => {
  const records = [record("A", "PASSED", 3), record("A", "PASSED", 3), record("C", "FAILED", 0), record("C", "PASSED", 4)];
  const p = calculateProgress(categories, groups, courses, records);
  assert.equal(p.summary.completed_au, summarizeRecords(records).earned_au);
  assert.equal(p.summary.completed_au, 7);
  assert.equal(p.summary.remaining_au, 3);
  assert.deepEqual(p.summary.completed_required_courses, ["A"]);
  assert.deepEqual(p.summary.remaining_required_courses, ["B"]);
  assert.equal(p.categories[1].elective_groups[0].completed_au, 4);
  assert.equal(p.categories[1].elective_groups[0].requirements_satisfied, true);
});
test("statuses prefer completed over planned; failed and in-progress never complete", () => {
  const p = calculateProgress(categories, groups, courses, [record("A", "PASSED", 3), record("B", "FAILED", 0), record("C", "IN_PROGRESS", 0)], ["A", "B"]);
  assert.deepEqual(p.courses.map(c => c.status), ["COMPLETED", "PLANNED", "NOT_YET_TAKEN", "NOT_YET_TAKEN"]);
  assert.equal(p.summary.completed_au, 3);
});
test("unknown legacy AU stays unknown; unrelated passes do not fill curriculum buckets", () => {
  const p = calculateProgress(categories, groups, courses, [record("A", "PASSED", null), record("OTHER", "PASSED", 20)]);
  assert.equal(p.summary.completed_au, 0);
  assert.equal(p.summary.au_complete, false);
  assert.equal(p.summary.remaining_au_is_upper_bound, true);
  assert.deepEqual(p.summary.unknown_au_course_codes, ["A"]);
  assert.deepEqual(p.unallocated_passed_course_codes, ["OTHER"]);
  assert.equal(p.courses[0].status, "COMPLETED");
});
test("surplus in one category does not discharge another; decimals retain AU precision", () => {
  const p = calculateProgress(categories, groups, courses, [record("A", "PASSED", 8.25), record("C", "PASSED", 1.5)]);
  assert.equal(p.summary.completed_au, 9.75);
  assert.equal(p.summary.remaining_au, 2.5);
  assert.equal(p.summary.requirements_satisfied, false);
});
test("category satisfaction also requires its elective group", () => {
  const p = calculateProgress([{ category_code: "MPE", required_au: 3 }], groups,
    [...courses, { course_code: "X", category_code: "MPE", is_required: 0 }], [record("X", "PASSED", 9)]);
  assert.equal(p.categories[0].remaining_au, 0);
  assert.equal(p.categories[0].requirements_satisfied, false);
});
test("missing cohort never guessed; multiple matching rows fail clearly", async () => {
  assert.equal(await matchCurriculum({ programme: "IEM", study_year: 3 }, { query() { throw Error("Must not query"); } }), null);
  await assert.rejects(matchCurriculum({ programme: "IEM", admission_year: 2024 }, { query: async () => [[{}, {}]] }), { status: 409 });
});
test("only explicit verified minimum-year rules affect eligibility", async () => {
  const student = { programme: "TEST", admission_year: 2024, study_year: 2 };
  const db = { query: async sql => [sql.includes("FROM programme_curriculum") ? [{ curriculum_id: 1 }] : []] };
  assert.equal((await evaluateCurriculumYear(student, "RECOMMENDED_YEAR_6", db)).eligible, true);
  const restricted = { query: async sql => [sql.includes("FROM programme_curriculum") ? [{ curriculum_id: 1 }] : [{ verified_min_study_year: 3, verification_source: "Synthetic verified rule" }]] };
  assert.equal((await evaluateCurriculumYear(student, "RULE", restricted)).eligible, false);
  assert.equal((await evaluateCurriculumYear({ ...student, study_year: 3 }, "RULE", restricted)).eligible, true);
  const ambiguous = { query: async () => [[{}, {}]] };
  assert.equal((await evaluateCurriculumYear(student, "RULE", ambiguous)).eligible, null);
});
