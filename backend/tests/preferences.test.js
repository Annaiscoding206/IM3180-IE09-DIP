const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePreferences, validateBlock } = require("../src/services/preferenceValidation");
const { findBlockedPeriodConflicts } = require("../src/services/blockedPeriodService");
const { planningIdentity } = require("../src/middleware/planningIdentity");

const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
const day = { day_of_week: "MON", preference_type: "AVOID", constraint_level: "HARD" };
const time = { start_time: "10:00", end_time: "11:00", preference_type: "PREFER", constraint_level: "SOFT" };

test("preference values preserve HARD/SOFT and normalize valid times", () => {
  assert.deepEqual(validatePreferences(empty()), empty());
  const result = validatePreferences({ day_preferences: [day], time_preferences: [time],
    objectives: [{ objective_type: "MINIMIZE_GAPS", priority: 2 }] });
  assert.equal(result.day_preferences[0].constraint_level, "HARD");
  assert.equal(result.time_preferences[0].constraint_level, "SOFT");
  assert.equal(result.time_preferences[0].start_time, "10:00:00");
});

test("reject incomplete payloads, unsupported enums, UNSPECIFIED and invalid priorities", () => {
  const invalid = [undefined, {}, { ...empty(), student_id: "DEMO001" },
    { ...empty(), day_preferences: null },
    { ...empty(), day_preferences: [{ ...day, constraint_level: "UNSPECIFIED" }] },
    { ...empty(), time_preferences: [{ ...time, constraint_level: "UNSPECIFIED" }] },
    { ...empty(), day_preferences: [{ ...day, day_of_week: "Monday" }] },
    { ...empty(), day_preferences: [{ ...day, preference_type: "BLOCK" }] },
    { ...empty(), objectives: [{ objective_type: "MAXIMIZE_GAPS", priority: 1 }] },
    ...[0, -1, 1.2, "1", null, 2147483648].map(priority => ({ ...empty(), objectives: [{ objective_type: "MINIMIZE_GAPS", priority }] }))];
  for (const payload of invalid) assert.throws(() => validatePreferences(payload), { status: 400 });
});

test("reject malformed, incomplete, equal, reversed and overnight time ranges", () => {
  for (const [start_time, end_time] of [["9:00", "10:00"], ["09:60", "10:00"], ["09:00", "24:00"],
    [null, "10:00"], ["09:00", undefined], ["10:00", "10:00"], ["11:00", "10:00"], ["23:00", "01:00"]]) {
    assert.throws(() => validatePreferences({ ...empty(), time_preferences: [{ ...time, start_time, end_time }] }), { status: 400 });
    assert.throws(() => validateBlock({ day_of_week: "MON", start_time, end_time }), { status: 400 });
  }
});

test("reject duplicate day, normalized time and objective keys", () => {
  const objective = { objective_type: "MINIMIZE_GAPS", priority: 1 };
  for (const payload of [
    { ...empty(), day_preferences: [day, { ...day, constraint_level: "SOFT" }] },
    { ...empty(), time_preferences: [time, { ...time, start_time: "10:00:00", end_time: "11:00:00" }] },
    { ...empty(), objectives: [objective, { ...objective, priority: 2 }] },
  ]) assert.throws(() => validatePreferences(payload), { status: 400 });
});

test("blocked overlap identifies partial, contained and identical overlaps", () => {
  const block = { block_id: 8, day_of_week: "MON", start_time: "10:00", end_time: "11:00" };
  const slot = { slot_id: 4, day_of_week: "MON", start_time: "09:30", end_time: "10:20" };
  const [conflict] = findBlockedPeriodConflicts([slot], [block]);
  assert.equal(conflict.slot.slot_id, 4);
  assert.equal(conflict.block.block_id, 8);
  assert.equal(conflict.overlap_start, "10:00:00");
  assert.equal(conflict.overlap_end, "10:20:00");
  for (const [start_time, end_time] of [["10:10", "10:30"], ["09:00", "12:00"], ["10:00", "11:00"]]) {
    assert.equal(findBlockedPeriodConflicts([{ ...slot, start_time, end_time }], [block]).length, 1);
  }
});

test("adjacent classes and different weekdays do not overlap blocks", () => {
  const block = { day_of_week: "MON", start_time: "10:00", end_time: "11:00" };
  for (const slot of [{ ...block, start_time: "09:00", end_time: "10:00" },
    { ...block, start_time: "11:00", end_time: "12:00" }, { ...block, day_of_week: "TUE" }]) {
    assert.deepEqual(findBlockedPeriodConflicts([slot], [block]), []);
  }
  assert.deepEqual(findBlockedPeriodConflicts([], [block]), []);
  assert.throws(() => findBlockedPeriodConflicts([{ ...block, start_time: null }], [block]));
});

test("identity uses trusted context or explicit local demo opt-in, never client student IDs", async t => {
  t.mock.method(require("../src/config/db"), "query", async (sql, [id]) => [[{ student_id: id }]]);
  const saved = { demo: process.env.DEMO_PLANNING_ENABLED, env: process.env.NODE_ENV, student: process.env.DEMO_PLANNING_STUDENT_ID };
  delete process.env.DEMO_PLANNING_STUDENT_ID;
  async function run({ student, address = "127.0.0.1", origin } = {}) {
    const req = { socket: { remoteAddress: address }, headers: { origin, "x-student-id": "VICTIM" },
      body: { student_id: "VICTIM" }, query: { student_id: "VICTIM" } };
    const res = { locals: { authenticatedStudentId: student }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
    await planningIdentity(req, res, () => { res.next = true; });
    return res;
  }
  try {
    process.env.NODE_ENV = "test";
    delete process.env.DEMO_PLANNING_ENABLED;
    assert.equal((await run()).code, 401);
    assert.equal((await run({ student: "TRUSTED" })).next, true);
    process.env.DEMO_PLANNING_ENABLED = "true";
    assert.equal((await run()).locals.authenticatedStudentId, "DEMO001");
    assert.equal((await run({ address: "192.0.2.1" })).code, 401);
    assert.equal((await run({ origin: "https://untrusted.example" })).code, 403);
    process.env.NODE_ENV = "production";
    assert.equal((await run()).code, 401);
  } finally {
    for (const [key, value] of [["DEMO_PLANNING_ENABLED", saved.demo], ["NODE_ENV", saved.env], ["DEMO_PLANNING_STUDENT_ID", saved.student]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
