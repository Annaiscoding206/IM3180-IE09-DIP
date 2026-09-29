const test = require("node:test");
const assert = require("node:assert/strict");
const { checkClashes } = require("../src/services/clashService");

function index(code, start, end, weeks = null, day = "MON", id = 1) {
  return { course_code: code, index_no: id, slots: [{
    slot_id: id, class_type: "LECTURE", class_group: "G1", day_of_week: day,
    start_time: start, end_time: end, teaching_weeks: weeks,
  }] };
}

test("NULL weeks produce potential overlap with precise conflict identity", () => {
  const result = checkClashes([index("A", "09:00:00", "10:00:00"), index("B", "09:30:00", "11:00:00", null, "MON", 2)]);
  assert.equal(result.status, "conflict");
  assert.equal(result.can_save, false);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].first.course_code, "A");
  assert.equal(result.conflicts[0].second.slot_id, 2);
  assert.equal(result.conflicts[0].overlap_start, "09:30:00");
  assert.equal(result.conflicts[0].overlap_end, "10:00:00");
  assert.equal(result.conflicts[0].certainty, "potential");
});

test("adjacent classes are allowed in either order", () => {
  const rows = [index("A", "09:00:00", "10:00:00"), index("B", "10:00:00", "11:00:00")];
  assert.equal(checkClashes(rows).can_save, true);
  assert.equal(checkClashes(rows.reverse()).can_save, true);
});

test("different days do not clash", () => {
  assert.equal(checkClashes([index("A", "09:00:00", "10:00:00"), index("B", "09:00:00", "10:00:00", null, "TUE")]).can_save, true);
});

test("nested intervals and identical times clash", () => {
  for (const [start, end] of [["09:30:00", "10:00:00"], ["09:00:00", "11:00:00"]]) {
    assert.equal(checkClashes([index("A", "09:00:00", "11:00:00"), index("B", start, end)]).can_save, false);
  }
});

test("numeric week lists and ranges use set intersection", () => {
  const a = index("A", "09:00:00", "10:00:00", "1-3, 5, 7-9");
  const b = index("B", "09:30:00", "10:30:00", "2,5,10");
  const result = checkClashes([a, b]);
  assert.deepEqual(result.conflicts[0].overlapping_weeks, [2, 5]);
  assert.equal(result.conflicts[0].certainty, "confirmed");
  b.slots[0].teaching_weeks = "4,6,10-13";
  assert.equal(checkClashes([a, b]).can_save, true);
});

test("one unspecified week field still makes overlap potential", () => {
  const result = checkClashes([index("A", "09:00:00", "10:00:00", "1-5"), index("B", "09:00:00", "10:00:00", " ")]);
  assert.equal(result.conflicts[0].certainty, "potential");
});

test("unsupported or malformed weeks make validation incomplete", () => {
  for (const weeks of ["odd", "3-1", "0", "1,", "1-99999999"]) {
    const result = checkClashes([index("A", "09:00:00", "10:00:00", weeks)]);
    assert.equal(result.status, "incomplete");
    assert.equal(result.can_save, false);
    assert.equal(result.data_issues.length, 1);
  }
});

test("missing slots are not mistaken for a clear timetable", () => {
  const result = checkClashes([{ course_code: "EMPTY", index_no: 7, slots: [] }]);
  assert.equal(result.status, "incomplete");
  assert.equal(result.can_save, false);
  assert.deepEqual(result.missing_slot_indexes, [{ course_code: "EMPTY", index_no: 7 }]);
});

test("all slots within one index are compared too", () => {
  const a = index("A", "09:00:00", "11:00:00");
  a.slots.push(index("A", "10:00:00", "12:00:00", null, "MON", 2).slots[0]);
  assert.equal(checkClashes([a]).conflicts.length, 1);
});

test("invalid times or days are incomplete, not clear", () => {
  for (const [start, end, day] of [["bad", "11:00:00", "MON"], ["11:00:00", "09:00:00", "MON"], ["09:00:00", "10:00:00", "BAD"]]) {
    assert.equal(checkClashes([index("A", start, end, null, day)]).status, "incomplete");
  }
});

test("an empty plan has no timetable clashes but does not assert completeness", () => {
  const result = checkClashes([]);
  assert.equal(result.status, "clear");
  assert.deepEqual(result.conflicts, []);
});
