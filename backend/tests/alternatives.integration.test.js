// RUN_MYSQL_TESTS=1 node --test tests/alternatives.integration.test.js
// Real HTTP/MySQL; only uniquely named temporary fixtures are inserted/deleted.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const path = require("node:path");

test("alternative indexes and generation explanations against MySQL/HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const prefs = require("../src/services/preferenceService");
  const alternatives = require("../src/services/alternativeIndexService");
  const express = require("express");
  const prefix = "X" + randomBytes(3).toString("hex").toUpperCase();
  const student = prefix + "S", foreign = prefix + "F";
  const code = letter => prefix + letter;
  const created = new Set(), students = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      for (const id of students) await pool.query("DELETE FROM student WHERE student_id = ?", [id]);
      for (const course of created) {
        await pool.query("DELETE FROM course_requirement WHERE course_code = ? OR required_course_code = ?", [course, course]);
        await pool.query("DELETE FROM programme_restriction WHERE course_code = ?", [course]);
        await pool.query("DELETE FROM mutual_exclusion WHERE course_code = ? OR excluded_course_code = ?", [course, course]);
        await pool.query("DELETE FROM course_info WHERE course_code = ?", [course]);
      }
      assert.equal((await pool.query("SELECT request_id FROM planning_request WHERE student_id IN (?, ?)", [student, foreign]))[0].length, 0);
    } finally { await pool.end(); }
  });
  for (const id of [student, foreign]) {
    await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Alternatives test', 'TEST', 3)", [id]);
    students.push(id);
  }
  async function slot(letter, index, day, start = "09:00:00", end = "10:00:00", weeks = null) {
    await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time, teaching_weeks)
      VALUES (?, ?, 'LECTURE', 'TEST', ?, ?, ?, ?)`, [code(letter), index, day, start, end, weeks]);
  }
  async function course(letter, index, day = "MON", start = "09:00:00", end = "10:00:00", year = "2026-2027", semester = 1, weeks = null) {
    await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, ?, 'Alternatives test', 3, 'LETTER_GRADED', ?, ?)`, [code(letter), index, year, semester]);
    created.add(code(letter));
    if (day) await slot(letter, index, day, start, end, weeks);
  }
  await course("A", 101);
  await course("A", 102, "TUE");
  await course("A", 103, "WED", "11:00:00", "12:00:00");
  await course("A", 104, null);
  await course("A", 105, "THU");
  await slot("A", 105, "FRI", "14:00:00", "15:00:00");
  await course("A", 106, "MON", "08:00:00", "09:00:00");
  await course("A", 107, "WED", "09:00:00", "10:00:00", "2025-2026");
  await course("A", 108, "WED", "09:00:00", "10:00:00", "2026-2027", 1, "odd");
  await course("A", 109, "WED", "09:00:00", "10:00:00", "2026-2027", 2);
  await course("A", 110);
  await slot("A", 110, "MON", "09:30:00", "10:30:00");
  await course("A", 111, "THU", "13:00:00", "14:00:00");
  await course("B", 201, "MON", "09:30:00", "10:30:00");
  await course("B", 202, "MON", "09:30:00", "10:30:00", "2025-2026");
  await course("C", 301, "TUE", "09:30:00", "10:30:00");
  await course("D", 401, "FRI", "14:30:00", "15:30:00");
  await course("E", 501);
  await course("K", 601);
  await course("L", 701, "TUE");
  await course("M", 801);
  await course("I", 901);
  await course("I", 902, "TUE");
  await course("T", 1001, "MON", "09:00:00", "10:00:00", "2025-2026");
  await course("U", 1101, null);
  await pool.query("INSERT INTO course_requirement (course_code, required_course_code, requirement_type, requirement_group) VALUES (?, ?, 'COREQUISITE', 1)", [code("K"), code("L")]);
  await pool.query("INSERT INTO mutual_exclusion (course_code, excluded_course_code) VALUES (?, ?)", [code("M"), code("L")]);
  await pool.query("INSERT INTO programme_restriction (course_code, programme, restriction_type) VALUES (?, 'TEST', 'NOT_AVAILABLE')", [code("I")]);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use("/api/plans", require("../src/routes/planRoutes"));
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(method, route, body) {
    const res = await fetch(base + route, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
    return { status: res.status, ...await res.json() };
  }
  const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
  async function context(letters, chosen = [], studentId = student) {
    const [r] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [studentId]);
    for (const letter of letters) await pool.query("INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)", [r.insertId, code(letter)]);
    const [p] = await pool.query("INSERT INTO plan (request_id, plan_name, rank_no, match_score, status) VALUES (?, 'Test plan', 1, 95, 'SELECTED')", [r.insertId]);
    for (const [letter, index, locked = false] of chosen) await pool.query("INSERT INTO plan_course (plan_id, course_code, index_no, locked) VALUES (?, ?, ?, ?)", [p.insertId, code(letter), index, locked]);
    return { request: r.insertId, plan: p.insertId };
  }
  const snapshot = async c => ({
    plan: (await pool.query("SELECT * FROM plan WHERE request_id = ? ORDER BY plan_id", [c.request]))[0],
    indexes: (await pool.query("SELECT * FROM plan_course WHERE plan_id = ? ORDER BY course_code", [c.plan]))[0],
    request: (await pool.query("SELECT * FROM planning_request WHERE request_id = ?", [c.request]))[0],
  });
  const get = (c, letter = "A", query = "") => http("GET", `/plans/${c.plan}/indexes/${code(letter)}/alternatives${query}`);
  const generate = (c, body = {}) => http("POST", `/planning-requests/${c.request}/generate-plans`, body);
  const reason = (data, value) => data.reasons.find(row => row.code === value);

  await t.test("clash alternatives validate the complete surrounding timetable and all sessions", async () => {
    const c = await context(["A", "B", "C", "D"], [["A", 101], ["B", 201], ["C", 301], ["D", 401]]);
    const before = await snapshot(c);
    const result = await get(c);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.evaluated_index_no, 101);
    assert.equal(result.data.evaluated_plan_valid, false);
    const clash = reason(result.data, "TIMETABLE_CLASH");
    assert.equal(clash.course_code, code("A"));
    assert.equal(clash.conflicting_course_code, code("B"));
    assert.equal(clash.conflicting_index_no, 201);
    assert.equal(clash.day, "MON");
    assert.deepEqual(result.data.alternatives.map(row => row.index_no), [103, 106, 111]);
    const rejected = n => result.data.rejected_alternatives.find(row => row.index_no === n);
    assert.equal(reason(rejected(102), "TIMETABLE_CLASH").conflicting_course_code, code("C"));
    assert.equal(reason(rejected(105), "TIMETABLE_CLASH").conflicting_course_code, code("D"), "Second session checked");
    assert.ok(reason(rejected(104), "INCOMPLETE_TIMETABLE_DATA"));
    assert.ok(reason(rejected(108), "INCOMPLETE_TIMETABLE_DATA"));
    assert.ok(reason(rejected(110), "TIMETABLE_CLASH"), "Internal index clash rejected");
    assert.ok(result.data.alternatives.every(row => row.validation.can_finalize));
    assert.ok(!result.data.alternatives.some(row => [101, 107, 109].includes(row.index_no)));
    assert.deepEqual((await get(c)).data, result.data, "Ordering and response deterministic");
    assert.deepEqual(await snapshot(c), before, "Suggestion read never changes selection, rank, status or locks");
  });
  await t.test("blocked-period alternatives and concrete block remediation", async () => {
    const c = await context(["A"], [["A", 101]]);
    const block = await prefs.addBlock(c.request, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:30" });
    const { data } = await get(c);
    const conflict = reason(data, "BLOCKED_PERIOD_CONFLICT");
    assert.equal(conflict.block_id, block.block_id);
    assert.equal(conflict.class_start, "09:00:00");
    assert.equal(conflict.blocked_start, "09:30:00");
    assert.ok(data.alternatives.some(row => row.index_no === 102));
    assert.ok(data.suggestions.some(s => s.action === "REVIEW_BLOCKED_PERIOD" && s.block_id === block.block_id));
    assert.ok(data.suggestions.some(s => s.action === "CHOOSE_INDEX" && s.index_no === 102));
  });
  await t.test("hard-day and hard-time alternatives obey both whitelist and exclusion rules", async () => {
    const c = await context(["A"], [["A", 101]]);
    await prefs.replacePreferences(c.request, student, { ...empty(), day_preferences: [{ day_of_week: "WED", preference_type: "PREFER", constraint_level: "HARD" }] });
    let result = await get(c);
    assert.ok(reason(result.data, "HARD_DAY_CONSTRAINT"));
    assert.deepEqual(result.data.alternatives.map(row => row.index_no), [103]);
    await prefs.replacePreferences(c.request, student, { ...empty(), time_preferences: [{ start_time: "09:30", end_time: "10:30", preference_type: "AVOID", constraint_level: "HARD" }] });
    result = await get(c);
    assert.ok(reason(result.data, "HARD_TIME_CONSTRAINT"));
    assert.deepEqual(result.data.alternatives.map(row => row.index_no), [103, 106, 111]);
  });
  await t.test("invalid locked index remains unchanged while alternatives are explicitly suggested", async () => {
    const c = await context(["A", "B"], [["A", 101, true], ["B", 201]]);
    const before = await snapshot(c);
    const { data } = await get(c);
    assert.equal(data.locked, true);
    assert.equal(data.auto_applied, false);
    assert.equal(data.requires_student_action, true);
    assert.ok(reason(data, "LOCKED_INDEX_INVALID"));
    assert.ok(data.alternatives.length > 0);
    assert.ok(data.alternatives.every(row => row.auto_applied === false && row.changes_locked_index && row.requires_student_action));
    assert.deepEqual(await snapshot(c), before);
  });
  await t.test("explicit preferred candidate is distinct from stored index; no index is inferred for empty choice", async () => {
    const c = await context(["A", "B"], [["A", 103], ["B", 201]]);
    const result = await get(c, "A", "?candidate_index_no=101");
    assert.equal(result.data.current_index_no, 103);
    assert.equal(result.data.candidate_index_no, 101);
    assert.equal(result.data.evaluation_source, "explicit_candidate");
    assert.ok(result.data.alternatives.some(row => row.index_no === 103), "Keeping stored index can resolve rejected candidate");
    const emptyChoice = await context(["A", "B"], [["B", 201]]);
    assert.equal((await get(emptyChoice)).status, 400);
    assert.equal((await get(emptyChoice, "A", "?candidate_index_no=101")).status, 200);
  });
  await t.test("wrong-term preferred index can be replaced but invalid surrounding terms/data cannot be ignored", async () => {
    const c = await context(["A"], [["A", 107]]);
    const result = await get(c);
    assert.ok(reason(result.data, "INDEX_TERM_MISMATCH"));
    assert.ok(result.data.alternatives.length > 0);
    for (const [other, number, reasonCode] of [["B", 202, "INDEX_TERM_MISMATCH"], ["U", 1101, "INCOMPLETE_TIMETABLE_DATA"]]) {
      const surrounding = await context(["A", other], [["A", 101], [other, number]]);
      const { data } = await get(surrounding);
      assert.equal(data.alternatives.length, 0);
      assert.ok(data.rejected_alternatives.every(row => reason(row, reasonCode)));
    }
    const partial = await context(["A", "B"], [["A", 101]]);
    const { data } = await get(partial);
    assert.equal(data.alternatives.length, 0);
    assert.ok(reason(data, "MISSING_SELECTED_INDEX"));
  });
  await t.test("no available alternative and course-level ineligibility do not fabricate replacements", async () => {
    const c = await context(["E", "B"], [["E", 501], ["B", 201]]);
    const result = await get(c, "E");
    assert.equal(result.status, 200);
    assert.equal(result.data.status, "no_valid_alternative");
    assert.deepEqual(result.data.alternatives, []);
    const ineligible = await context(["I"], [["I", 901]]);
    const { data } = await get(ineligible, "I");
    assert.equal(data.alternative_count, 0);
    assert.equal(reason(data, "COURSE_INELIGIBLE").index_change_can_resolve, false);
    assert.ok(!data.suggestions.some(s => s.action === "CHOOSE_INDEX"));
  });
  await t.test("no-plan clash and locked-conflict reasons include exact observed evidence", async () => {
    const c = await context(["E", "B"], [["E", 501, true], ["B", 201]]);
    const before = await snapshot(c);
    const result = await generate(c, { source_plan_id: c.plan });
    assert.equal(result.status, 422);
    assert.equal(result.code, "NO_FEASIBLE_PLAN");
    const clash = reason(result, "TIMETABLE_CLASH");
    assert.ok(clash.course_code && clash.index_no && clash.conflicting_course_code && clash.conflicting_index_no);
    assert.equal(clash.day, "MON");
    assert.equal(clash.evidence_scope, "observed_rejection");
    assert.ok(reason(result, "LOCKED_INDEX_CONFLICT"));
    assert.ok(result.suggestions.some(s => s.action === "REVIEW_LOCKED_INDEX" && s.index_no === 501));
    assert.deepEqual(await snapshot(c), before);
  });
  await t.test("no-plan blocked/hard-day/hard-time failures provide linked remedies", async () => {
    const blocked = await context(["E"]);
    const block = await prefs.addBlock(blocked.request, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:30" });
    const response = await generate(blocked);
    assert.equal(response.status, 422);
    assert.equal(reason(response, "BLOCKED_PERIOD_CONFLICT").block_id, block.block_id);
    assert.ok(response.suggestions.some(s => s.action === "REVIEW_BLOCKED_PERIOD" && s.block_id === block.block_id));
    for (const [section, value, expected] of [
      ["day_preferences", { day_of_week: "MON", preference_type: "AVOID", constraint_level: "HARD" }, "HARD_DAY_CONSTRAINT"],
      ["time_preferences", { start_time: "09:30", end_time: "10:30", preference_type: "AVOID", constraint_level: "HARD" }, "HARD_TIME_CONSTRAINT"],
    ]) {
      const c = await context(["E"]);
      await prefs.replacePreferences(c.request, student, { ...empty(), [section]: [value] });
      const result = await generate(c);
      assert.equal(result.status, 422);
      assert.ok(reason(result, expected));
      assert.ok(result.suggestions.some(s => s.action === "REVIEW_HARD_CONSTRAINT"));
      assert.ok(result.suggestions.every(s => s.reason_ids.every(id => result.reasons.some(r => r.reason_id === id))));
    }
  });
  await t.test("no-plan academic/corequisite/exclusion/term/data failures are distinguished", async () => {
    for (const [letters, expected, action] of [
      [["I"], "COURSE_INELIGIBLE", "REVIEW_COURSE_ELIGIBILITY"],
      [["K"], "COREQUISITE_UNSATISFIED", "SELECT_COREQUISITE"],
      [["M", "L"], "MUTUAL_EXCLUSION", "REVIEW_SELECTED_COURSES"],
      [["T"], "NO_INDEXES_FOR_TERM", "REVIEW_TERM_SELECTION"],
      [["U"], "INCOMPLETE_TIMETABLE_DATA", "REVIEW_TIMETABLE_DATA"],
    ]) {
      const result = await generate(await context(letters));
      assert.equal(result.status, 422, JSON.stringify(result));
      assert.ok(reason(result, expected), JSON.stringify(result.reasons));
      assert.ok(result.suggestions.some(s => s.action === action));
      if (expected === "COREQUISITE_UNSATISFIED") assert.deepEqual(result.suggestions.find(s => s.action === action).course_options, [code("L")]);
      if (expected === "INCOMPLETE_TIMETABLE_DATA") assert.equal(result.infeasibility_proven, false);
    }
  });
  await t.test("source ownership, request selection and candidate parameters are enforced", async () => {
    const c = await context(["A"], [["A", 101]]);
    const foreignContext = await context(["A"], [["A", 101]], foreign);
    assert.equal((await get(foreignContext)).status, 404);
    await assert.rejects(alternatives.getAlternatives(c.plan, code("A"), null), { status: 401 });
    assert.equal((await get(c, "B", "?candidate_index_no=201")).status, 422);
    for (const query of ["?candidate_index_no=abc", "?candidate_index_no=101&candidate_index_no=102", "?index_no=101", "?student_id=OTHER"]) {
      assert.equal((await get(c, "A", query)).status, 400);
    }
    assert.equal((await get(c, "A", "?candidate_index_no=201")).status, 404);
    assert.equal((await get({ plan: 2147483647 })).status, 404);
  });
  await t.test("live search limit remains 409 with evidence, not a proven no-feasible-plan", async () => {
    // Twelve courses competing for eleven disjoint hour slots: early forward
    // checking prunes, but the prototype's deterministic search budget expires.
    const letters = Array.from({ length: 12 }, (_, i) => `Z${i}`);
    for (const letter of letters) for (let i = 0; i < 11; i++) {
      await course(letter, 2000 + i, "MON", `${String(6 + i).padStart(2, "0")}:00:00`, `${String(7 + i).padStart(2, "0")}:00:00`);
    }
    const c = await context(letters);
    const before = await snapshot(c);
    const start = performance.now();
    const result = await generate(c);
    const elapsed = performance.now() - start;
    assert.equal(result.status, 409, JSON.stringify(result));
    assert.equal(result.code, "SEARCH_LIMIT_REACHED");
    assert.equal(result.infeasibility_proven, false);
    assert.equal(result.search.exhaustive, false);
    assert.equal(result.search.limit_reason, "NODE_LIMIT");
    assert.equal(result.search.visited_nodes, result.search.max_nodes);
    assert.equal(result.reasons[0].code, "SEARCH_LIMIT_REACHED");
    assert.ok(!result.reasons.some(r => r.code === "NO_CLASH_FREE_COMBINATION"));
    assert.deepEqual(await snapshot(c), before);
    t.diagnostic(`Bounded search: ${result.search.visited_nodes} nodes, ${result.search.forward_prunes} forward prunes, ${result.search.observed_conflicts.length} conflict samples, ${elapsed.toFixed(1)} ms HTTP`);
  });
});
