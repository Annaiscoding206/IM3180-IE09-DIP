const test = require("node:test");
const assert = require("node:assert/strict");
const { checkClashes } = require("../src/services/clashService");
const { checkHardConstraints } = require("../src/services/hardConstraintService");
const { searchTimetables } = require("../src/services/timetableSearchService");
const { validationReasons, explainReasons, explainGeneration } = require("../src/services/planningExplanationService");

const index = (course_code, index_no, start_time = "09:00:00", end_time = "10:00:00") => ({ course_code, index_no,
  slots: [{ slot_id: index_no, day_of_week: "MON", start_time, end_time, teaching_weeks: null }] });
const prefs = () => ({ day_preferences: [], time_preferences: [], objectives: [], blocked_periods: [] });

test("clash reasons orient the evaluated course and preserve overlap evidence", () => {
  const timetable = checkClashes([index("B", 2, "09:30:00", "10:30:00"), index("A", 1)]);
  const reasons = validationReasons({ timetable }, "A");
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].course_code, "A");
  assert.equal(reasons[0].conflicting_course_code, "B");
  assert.equal(reasons[0].class_start, "09:00:00");
  assert.equal(reasons[0].conflicting_class_start, "09:30:00");
  assert.equal(reasons[0].overlap_start, "09:30:00");
  assert.equal(reasons[0].certainty, "potential");
});

test("block and hard-rule remedies refer to actual validation evidence", () => {
  const p = { ...prefs(), blocked_periods: [{ block_id: 7, day_of_week: "MON", start_time: "09:30", end_time: "11:00" }],
    day_preferences: [{ day_of_week: "TUE", preference_type: "PREFER", constraint_level: "HARD" }],
    time_preferences: [{ start_time: "11:00", end_time: "12:00", preference_type: "PREFER", constraint_level: "HARD" }] };
  const data = explainReasons(validationReasons({ constraints: checkHardConstraints([index("A", 1)], p) }));
  assert.deepEqual(data.reasons.map(r => r.code), ["HARD_DAY_CONSTRAINT", "HARD_TIME_CONSTRAINT", "BLOCKED_PERIOD_CONFLICT"]);
  const blocked = data.reasons.find(r => r.code === "BLOCKED_PERIOD_CONFLICT");
  assert.equal(blocked.blocked_start, "09:30:00");
  assert.equal(blocked.block_id, 7);
  assert.deepEqual(data.reasons[0].allowed_days, ["TUE"]);
  assert.equal(data.reasons[1].allowed_windows[0].start_time, "11:00:00");
  assert.ok(data.suggestions.every(s => s.auto_applied === false && s.guarantees_feasibility === false));
  assert.ok(data.suggestions.every(s => s.reason_ids.every(id => data.reasons.some(r => r.reason_id === id))));
});

test("search evidence is bounded, deterministic and distinguishes observed locked conflicts", () => {
  const domains = [{ course_code: "A", locked: true, indexes: [index("A", 1)] },
    { course_code: "B", indexes: Array.from({ length: 25 }, (_, i) => index("B", i + 2)) }];
  const result = searchTimetables(domains);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.search.observed_conflicts.length, 20);
  assert.equal(result.search.conflict_evidence_truncated, true);
  assert.deepEqual(result, searchTimetables(domains));
  const explanation = explainGeneration([{ code: "LOCKED_COMBINATION_INFEASIBLE" }], result.search);
  assert.ok(explanation.reasons.some(r => r.code === "LOCKED_INDEX_CONFLICT"));
  assert.ok(explanation.reasons.filter(r => r.code === "TIMETABLE_CLASH").every(r => r.evidence_scope === "observed_rejection"));
  assert.ok(explanation.suggestions.some(s => s.action === "REVIEW_LOCKED_INDEX" && s.index_no === 1));
});

test("bounded search never returns a proven-no-plan or invented lock cause", () => {
  const domains = ["A", "B"].map((course_code, i) => ({ course_code, indexes: [index(course_code, i,
    `${String(8 + i).padStart(2, "0")}:00:00`, `${String(9 + i).padStart(2, "0")}:00:00`)] }));
  const { search } = searchTimetables(domains, { max_candidates: 5, max_nodes: 1 });
  const data = explainGeneration([{ code: "LOCKED_COMBINATION_INFEASIBLE" }], search);
  assert.equal(data.reasons[0].code, "SEARCH_LIMIT_REACHED");
  assert.equal(data.infeasibility_proven, false);
  assert.ok(!data.reasons.some(r => r.code === "LOCKED_COMBINATION_INFEASIBLE" || r.code === "LOCKED_INDEX_CONFLICT"));
  assert.ok(!data.suggestions.some(s => s.action === "REVIEW_LOCKED_INDEX"));
});

test("incomplete data is not presented as proof that the real timetable is infeasible", () => {
  const timetable = checkClashes([{ course_code: "A", index_no: 1, slots: [] }]);
  const data = explainGeneration([{ code: "NO_VALID_INDEX", course_code: "A", term_index_count: 1,
    rejected_indexes: [{ timetable, constraints: { violations: [{ code: "INCOMPLETE_TIMETABLE", data: timetable }] } }] }], { exhaustive: true });
  assert.equal(data.infeasibility_proven, false);
  assert.equal(data.reasons.filter(r => r.code === "INCOMPLETE_TIMETABLE_DATA").length, 1, "Duplicate evidence collapsed");
});

test("corequisite and mutual-exclusion remedies never claim index changes fix academics", () => {
  const eligibility = { courses: [{ course_code: "A", prerequisite_eligible: true, programme_eligible: true,
    corequisite_eligible: false, missing_corequisite_groups: [{ requirement_group: 1, alternatives: ["B", "C"] }],
    conflicting_selected_courses: ["D"], conflicting_completed_courses: ["E"] }] };
  const data = explainReasons(validationReasons({ eligibility }));
  assert.ok(data.reasons.every(r => r.index_change_can_resolve === false));
  assert.deepEqual(data.suggestions.find(s => s.action === "SELECT_COREQUISITE").course_options, ["B", "C"]);
  assert.match(data.suggestions.find(s => s.conflicting_course_context === "completed").explanation, /completed coursework/);
  assert.ok(!data.suggestions.some(s => s.action === "CHOOSE_INDEX"));
});
