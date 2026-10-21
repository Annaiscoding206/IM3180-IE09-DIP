import test from "node:test";
import assert from "node:assert/strict";
import { indexProblem, generationProblem } from "../src/reasonUtils.js";

const warning = { course_code: "IE3014", index_no: 32423,
  message: "Teaching weeks unspecified; assuming possible overlap" };
const timetable = () => ({ status: "clear", conflicts: [], missing_slot_indexes: [],
  data_issues: [], warnings: [warning] });

test("preview exposes completed/unselected plan blockers and separates teaching-week warnings", () => {
  const problem = indexProblem("IE3014", 32423, null, {
    ...timetable(), can_save: false, eligibility: {
      unselected_courses: ["MH1810"], missing_index_courses: ["CS2024"],
      courses: [{ course_code: "MH1810", already_completed: true, can_select: false },
        { course_code: "IE3014", can_select: true }],
    },
  });
  assert.ok(problem.reasons.some(reason => /MH1810.*not selected/.test(reason)));
  assert.ok(problem.reasons.some(reason => /MH1810.*already been completed/.test(reason)));
  assert.ok(problem.reasons.every(reason => !/Teaching weeks|CS2024/.test(reason)));
  assert.match(problem.warnings[0], /Teaching weeks unspecified/);
});

test("failed writes read nested timetable conflicts, academic blockers and term errors", () => {
  const error = { message: "Planning validation failed", details: { validation: {
    timetable: { ...timetable(), conflicts: [{
      first: { course_code: "A" }, second: { course_code: "B" },
      day_of_week: "MON", overlap_start: "10:00:00", overlap_end: "11:00:00",
    }] },
    eligibility: { courses: [{ course_code: "A", can_select: false, message: "Missing prerequisite group" }] },
    invalid_term_indexes: [{ course_code: "B", index_no: 99 }],
  } } };
  const problem = indexProblem("A", 1, error);
  assert.ok(problem.reasons.some(reason => /A and B overlap.*MON/.test(reason)));
  assert.ok(problem.reasons.some(reason => /Missing prerequisite group/.test(reason)));
  assert.ok(problem.reasons.some(reason => /B index 99.*academic year/.test(reason)));
  assert.equal(problem.warnings.length, 1);
});

test("blocked periods and hard rules produce blocking reasons with course/time context", () => {
  const slot = { course_code: "IE3014", index_no: 32423, day_of_week: "TUE",
    start_time: "12:30:00", end_time: "14:30:00" };
  const problem = indexProblem("IE3014", 32423, null, { ...timetable(),
    constraints: { valid: false, violations: [
      { code: "BLOCKED_PERIOD", slot, block: { start_time: "13:00:00", end_time: "14:00:00" } },
      { code: "HARD_PREFER_DAY", slot, allowed_days: ["MON", "WED"] },
    ] } });
  assert.ok(problem.reasons.some(reason => /IE3014 32423 TUE.*blocked period.*13:00/.test(reason)));
  assert.ok(problem.reasons.some(reason => /allowed days: MON, WED/.test(reason)));
});

test("direct candidate eligibility failures and local locked-index errors keep their explanations", () => {
  const problem = indexProblem("A", 1, { message: "Course cannot be selected", details: {
    eligibility: { course_code: "A", already_completed: true, can_select: false },
  } });
  assert.match(problem.reasons[0], /already been completed/);
  assert.match(indexProblem("A", 1, null, null, "Unlock index 2 first.").summary, /Unlock index 2 first/);
});

test("pending indexes and concurrent corequisites are not presented as incremental save blockers", () => {
  const problem = indexProblem("A", 1, null, { ...timetable(), eligibility: {
    missing_index_courses: ["B"], courses: [{
      course_code: "A", can_select: true, eligible: false, corequisite_eligible: false,
      message: "Missing corequisite", missing_corequisite_groups: [{ alternatives: ["B"] }],
    }],
  } });
  assert.deepEqual(problem.reasons, []);
  assert.equal(problem.warnings.length, 1);
});

test("generation groups repeated index reasons, retains index identities and avoids repeating remedies", () => {
  const detail = number => ({ code: "INCOMPLETE_TIMETABLE_DATA", course_code: "CS2024",
    index_no: number, explanation: "This index has no class slots." });
  const issue = generationProblem({ code: "NO_FEASIBLE_PLAN", infeasibility_proven: false,
    reasons: [{ code: "NO_VALID_INDEX", course_code: "CS2024", explanation: "No usable index." },
      detail(32601), detail(32602)],
    suggestions: [{ explanation: "Obtain complete timetable data." }, { explanation: "Obtain complete timetable data." }],
  });
  assert.equal(issue.reasons.length, 1);
  assert.deepEqual(issue.reasons[0].indexes, [32601, 32602]);
  assert.equal(issue.suggestions.length, 1);
  assert.match(issue.summary, /validated timetable could not be generated/);
});

test("generation keeps distinct causes and courses separate even when wording is identical", () => {
  const issue = generationProblem({ reasons: [
    { course_code: "A", code: "HARD_DAY_CONSTRAINT", explanation: "Rule failed." },
    { course_code: "A", code: "HARD_TIME_CONSTRAINT", explanation: "Rule failed." },
    { course_code: "B", code: "HARD_DAY_CONSTRAINT", explanation: "Rule failed." },
  ] });
  assert.equal(issue.reasons.length, 3);
});

test("search limits and incomplete evidence never become a proven infeasibility claim", () => {
  assert.match(generationProblem({ code: "SEARCH_LIMIT_REACHED" }).summary, /Feasibility is still unconfirmed/);
  assert.match(generationProblem({ code: "NO_FEASIBLE_PLAN", infeasibility_proven: false }).summary, /validated timetable/);
  assert.match(generationProblem({ code: "NO_FEASIBLE_PLAN", infeasibility_proven: true }).summary, /current courses and hard constraints/);
});
