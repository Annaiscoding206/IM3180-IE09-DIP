const test = require("node:test");
const assert = require("node:assert/strict");
const { checkHardConstraints } = require("../src/services/hardConstraintService");
const { scorePlan, rankPlans, combinationKey } = require("../src/services/planRankingService");
const { searchTimetables } = require("../src/services/timetableSearchService");

const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [], blocked_periods: [] });
const slot = (day = "MON", start = "09:00:00", end = "10:00:00", weeks = null) =>
  ({ day_of_week: day, start_time: start, end_time: end, teaching_weeks: weeks });
const index = (code, number, ...slots) => ({ course_code: code, index_no: number, slots });
const day = (value, type = "PREFER", level = "HARD") => ({ day_of_week: value, preference_type: type, constraint_level: level });
const time = (start, end, type = "PREFER", level = "HARD") => ({ start_time: start, end_time: end, preference_type: type, constraint_level: level });
const valid = (slots, preferences) => checkHardConstraints([index("A", 1, ...slots)], preferences).valid;

test("hard preferred days are alternatives, not required attendance days", () => {
  const p = { ...empty(), day_preferences: [day("MON"), day("WED")] };
  assert.equal(valid([slot()], p), true);
  assert.equal(valid([slot("WED")], p), true);
  assert.equal(valid([slot(), slot("WED")], p), true);
  assert.equal(valid([slot("TUE")], p), false);
});
test("hard preferred times require full containment in a single alternative window", () => {
  const p = { ...empty(), time_preferences: [time("09:00", "12:00"), time("14:00", "18:00")] };
  assert.equal(valid([slot("MON", "09:00:00", "12:00:00")], p), true);
  assert.equal(valid([slot("MON", "14:00:00", "18:00:00")], p), true);
  assert.equal(valid([slot("MON", "11:00:00", "15:00:00")], p), false);
  assert.equal(valid([slot("MON", "08:59:00", "10:00:00")], p), false);
  p.time_preferences = [time("09:00", "10:00"), time("10:00", "11:00")];
  assert.equal(valid([slot("MON", "09:30:00", "10:30:00")], p), false);
});
test("hard avoid days/times and contradictory prefer rules are never weakened", () => {
  assert.equal(valid([slot()], { ...empty(), day_preferences: [day("MON", "AVOID")] }), false);
  assert.equal(valid([slot()], { ...empty(), day_preferences: [day("MON"), day("MON", "AVOID")] }), false);
  assert.equal(valid([slot()], { ...empty(), time_preferences: [time("09:00", "10:00"), time("09:00", "10:00", "AVOID")] }), false);
  assert.equal(valid([slot()], { ...empty(), time_preferences: [time("09:30", "11:00", "AVOID")] }), false);
  assert.equal(valid([slot()], { ...empty(), time_preferences: [time("10:00", "11:00", "AVOID")] }), true);
});
test("blocks reject partial overlaps, allow adjacency and ignore other weekdays", () => {
  const p = { ...empty(), blocked_periods: [{ day_of_week: "MON", start_time: "10:00", end_time: "11:00" }] };
  assert.equal(valid([slot("MON", "09:30:00", "10:20:00")], p), false);
  assert.equal(valid([slot()], p), true);
  assert.equal(valid([slot("TUE", "10:00:00", "11:00:00")], p), true);
  assert.equal(valid([], p), false);
});
test("gap calculation merges overlaps and nesting, counts only positive same-day gaps", () => {
  const metrics = scorePlan([index("A", 1, slot(), slot("MON", "09:15:00", "09:30:00"),
    slot("MON", "10:30:00", "11:00:00"), slot("MON", "11:00:00", "12:00:00"), slot("TUE"))], empty());
  assert.equal(metrics.total_gap_minutes, 30);
  assert.equal(metrics.campus_days, 2);
});
test("soft preferred/avoided days and times affect ranking and expose rewards", () => {
  const monday = [index("A", 1, slot())], tuesday = [index("A", 2, slot("TUE", "14:00:00", "15:00:00"))];
  for (const p of [{ ...empty(), day_preferences: [day("TUE", "PREFER", "SOFT")] },
    { ...empty(), day_preferences: [day("MON", "AVOID", "SOFT")] },
    { ...empty(), time_preferences: [time("14:00", "15:00", "PREFER", "SOFT")] },
    { ...empty(), time_preferences: [time("09:00", "10:00", "AVOID", "SOFT")] }]) {
    assert.equal(rankPlans([monday, tuesday], p)[0].indexes[0].index_no, 2);
  }
  const score = scorePlan(monday, { ...empty(), time_preferences: [time("09:30", "10:30", "PREFER", "SOFT")] });
  assert.equal(score.soft_time_reward, 0.5);
  assert.equal(score.soft_time_penalty, 0.5);
  assert.equal(score.match_score, 66.67);
});
const compactDays = [index("A", 1, slot(), slot("MON", "13:00:00", "14:00:00"))];
const compactGaps = [index("A", 2, slot(), slot("TUE"))];
test("school-day and gap objectives each affect ranking", () => {
  for (const [objective_type, expected] of [["MINIMIZE_SCHOOL_DAYS", 1], ["MINIMIZE_GAPS", 2]]) {
    const ranked = rankPlans([compactDays, compactGaps], { ...empty(), objectives: [{ objective_type, priority: 1 }] });
    assert.equal(ranked[0].indexes[0].index_no, expected);
  }
});
test("priority weights change ranking; exact score formula and deterministic tie breaks", () => {
  const preferences = (days, gaps) => ({ ...empty(), objectives: [
    { objective_type: "MINIMIZE_SCHOOL_DAYS", priority: days }, { objective_type: "MINIMIZE_GAPS", priority: gaps }] });
  assert.equal(rankPlans([compactDays, compactGaps], preferences(1, 10))[0].indexes[0].index_no, 1);
  assert.equal(rankPlans([compactDays, compactGaps], preferences(10, 1))[0].indexes[0].index_no, 2);
  assert.equal(scorePlan(compactDays, preferences(1, 10)).cost, 1 / 7 + 180 / 600 / 10);
  assert.deepEqual(rankPlans([compactDays, compactGaps], empty()), rankPlans([compactGaps, compactDays], empty()));
});
test("backtracking produces distinct combinations and prunes clashes before deeper search", () => {
  const a = index("A", 1, slot()), a2 = index("A", 2, slot("TUE"));
  const b = index("B", 1, slot()), b2 = index("B", 2, slot("WED"));
  const domains = [{ course_code: "A", indexes: [a2, a, a] }, { course_code: "B", indexes: [b2, b] }];
  const result = searchTimetables(domains);
  assert.equal(result.candidates.length, 3);
  assert.equal(new Set(result.candidates.map(combinationKey)).size, 3);
  assert.ok(result.search.clash_prunes + result.search.forward_prunes > 0);
  assert.equal(result.search.exhaustive, true);
});
test("locked singleton preserves index and impossible lock has no combinations", () => {
  const a = { course_code: "A", locked: true, indexes: [index("A", 3, slot())] };
  const b = { course_code: "B", indexes: [index("B", 1, slot()), index("B", 2, slot("TUE"))] };
  const result = searchTimetables([b, a]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0][0].index_no, 3);
  assert.equal(searchTimetables([a, { ...b, indexes: [b.indexes[0]] }]).candidates.length, 0);
});
test("search limits are explicit and deterministic, never mislabeled exhaustive", () => {
  const domains = ["A", "B", "C"].map((course_code, n) => ({ course_code,
    indexes: Array.from({ length: 8 }, (_, k) => index(course_code, k + 1, slot(["MON", "TUE", "WED"][n]))) }));
  const result = searchTimetables(domains, { max_candidates: 5, max_nodes: 100 });
  assert.equal(result.candidates.length, 5);
  assert.equal(result.search.exhaustive, false);
  assert.equal(result.search.limit_reason, "CANDIDATE_LIMIT");
  assert.deepEqual(result, searchTimetables(domains, { max_candidates: 5, max_nodes: 100 }));
  const bounded = searchTimetables(domains, { max_candidates: 5, max_nodes: 1 });
  assert.equal(bounded.search.exhaustive, false);
  assert.equal(bounded.candidates.length, 0);
});
