// RUN_MYSQL_TESTS=1 node --test tests/generation.integration.test.js
// Isolated temporary fixtures, cleaned up afterward. No schema/seed changes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const path = require("node:path");

test("generation against local MySQL and HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const preferences = require("../src/services/preferenceService");
  const generation = require("../src/services/generationService");
  const plans = require("../src/services/planService");
  const express = require("express");
  const prefix = "G" + randomBytes(3).toString("hex").toUpperCase();
  const student = prefix + "S";
  const codes = Object.fromEntries(["A", "B", "C", "D", "E", "F", "I", "K", "M", "N", "O", "T"].map(key => [key, prefix + key]));
  const created = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query("DELETE FROM student WHERE student_id = ?", [student]);
      for (const code of created) {
        await pool.query("DELETE FROM mutual_exclusion WHERE course_code = ? OR excluded_course_code = ?", [code, code]);
        await pool.query("DELETE FROM programme_restriction WHERE course_code = ?", [code]);
        await pool.query("DELETE FROM course_requirement WHERE course_code = ? OR required_course_code = ?", [code, code]);
        await pool.query("DELETE FROM course_info WHERE course_code = ?", [code]);
      }
      assert.equal((await pool.query("SELECT request_id FROM planning_request WHERE student_id = ?", [student]))[0].length, 0);
    } finally { await pool.end(); }
  });
  await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Generation test', 'TEST', 3)", [student]);
  async function course(letter, number, day = "MON", start = "09:00:00", end = "10:00:00", year = "2026-2027", semester = 1, weeks = null) {
    const code = codes[letter];
    await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, ?, 'Generation test', 3, 'LETTER_GRADED', ?, ?)`, [code, number, year, semester]);
    if (!created.includes(code)) created.push(code);
    if (day) await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time, teaching_weeks)
      VALUES (?, ?, 'LECTURE', 'TEST', ?, ?, ?, ?)`, [code, number, day, start, end, weeks]);
  }
  await course("A", 101);
  await course("A", 102, "MON", "10:00:00", "11:00:00");
  await course("A", 103, "TUE");
  await course("A", 104, "MON", "13:00:00", "14:00:00");
  await course("B", 201, "MON", "10:00:00", "11:00:00");
  await course("B", 202, "TUE", "10:00:00", "11:00:00");
  await course("C", 301);
  await course("D", 401);
  await course("D", 402, "TUE");
  await course("E", 501, "MON", "09:30:00", "10:30:00");
  await course("F", 601, "MON", "10:00:00", "11:00:00");
  await course("I", 701);
  await course("K", 801);
  await course("M", 901);
  await course("N", 1001, null);
  await course("O", 1101, "MON", "09:00:00", "10:00:00", "2026-2027", 1, "odd");
  await course("T", 1201, "MON", "09:00:00", "10:00:00", "2025-2026");
  await course("T", 1202, "MON", "09:00:00", "10:00:00", "2026-2027", 2);
  await pool.query("INSERT INTO programme_restriction (course_code, programme, restriction_type) VALUES (?, 'TEST', 'NOT_AVAILABLE')", [codes.I]);
  await pool.query("INSERT INTO course_requirement (course_code, required_course_code, requirement_type, requirement_group) VALUES (?, ?, 'COREQUISITE', 1)", [codes.K, codes.F]);
  await pool.query("INSERT INTO mutual_exclusion (course_code, excluded_course_code) VALUES (?, ?)", [codes.M, codes.F]);

  const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
  const hardDay = (day_of_week, preference_type = "AVOID") => ({ day_of_week, preference_type, constraint_level: "HARD" });
  const hardTime = (start_time, end_time, preference_type = "AVOID") => ({ start_time, end_time, preference_type, constraint_level: "HARD" });
  async function request(letters, prefs) {
    const [row] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [student]);
    for (const letter of letters) await pool.query("INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)", [row.insertId, codes[letter]]);
    if (prefs) await preferences.replacePreferences(row.insertId, student, prefs);
    return row.insertId;
  }
  async function manual(id, letter, number, locked = false, status = "GENERATED") {
    const [row] = await pool.query("INSERT INTO plan (request_id, plan_name, rank_no, match_score, status) VALUES (?, ?, 1, 95, ?)", [id, `Manual ${letter} ${number} ${status}`, status]);
    await pool.query("INSERT INTO plan_course (plan_id, course_code, index_no, locked) VALUES (?, ?, ?, ?)", [row.insertId, codes[letter], number, locked]);
    return row.insertId;
  }
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  app.use("/api/plans", require("../src/routes/planRoutes"));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(method, route, body) {
    const result = await fetch(base + route, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    // Express can reject malformed JSON before the controller, returning HTML.
    const response = result.headers.get("content-type")?.includes("application/json")
      ? await result.json() : { message: await result.text() };
    return { status: result.status, ...response };
  }
  const generate = (id, body = {}) => http("POST", `/planning-requests/${id}/generate-plans`, body);
  const snapshot = async id => ({
    plans: (await pool.query("SELECT * FROM plan WHERE request_id = ? ORDER BY plan_id", [id]))[0],
    indexes: (await pool.query("SELECT pc.* FROM plan_course pc JOIN plan p ON p.plan_id = pc.plan_id WHERE p.request_id = ? ORDER BY pc.plan_course_id", [id]))[0],
  });
  async function rejected(id, expectedCode) {
    const before = await snapshot(id);
    const result = await generate(id);
    assert.equal(result.status, 422, JSON.stringify(result));
    assert.equal(result.code, "NO_FEASIBLE_PLAN");
    assert.deepEqual(result.plans, []);
    assert.ok(result.reasons.some(reason => reason.code === expectedCode), JSON.stringify(result.reasons));
    assert.deepEqual(await snapshot(id), before);
    return result;
  }
  const key = p => p.indexes.map(i => `${i.course_code}/${i.index_no}`).sort().join(",");

  await t.test("one or two feasible alternatives persist exactly that count", async () => {
    for (const [letter, count] of [["C", 1], ["D", 2]]) {
      const id = await request([letter]);
      const result = await generate(id);
      assert.equal(result.status, 201, JSON.stringify(result));
      assert.equal(result.data.plans.length, count);
      assert.equal((await snapshot(id)).plans.length, count);
      assert.equal(result.data.search.exhaustive, true);
      for (const plan of result.data.plans) {
        assert.equal(plan.validation.can_finalize, true);
        assert.equal((await http("GET", `/plans/${plan.plan_id}/validation`)).data.can_finalize, true);
      }
    }
  });
  let multiRequest, firstBatch;
  await t.test("multiple combinations produce three distinct ranked persisted plans", async () => {
    multiRequest = await request(["A", "B"]);
    const result = await generate(multiRequest);
    assert.equal(result.status, 201, JSON.stringify(result));
    firstBatch = result.data.plans;
    assert.equal(firstBatch.length, 3);
    assert.equal(new Set(firstBatch.map(key)).size, 3);
    assert.deepEqual(firstBatch.map(p => p.label), ["Plan A", "Plan B", "Plan C"]);
    assert.deepEqual(firstBatch.map(p => p.rank_no), [1, 2, 3]);
    assert.ok(result.data.search.clash_prunes + result.data.search.forward_prunes > 0);
    for (const plan of firstBatch) {
      assert.equal(plan.indexes.length, 2, "Never drop a selected course");
      assert.equal(plan.validation.can_finalize, true);
      const stored = (await snapshot(multiRequest)).plans.find(p => p.plan_id === plan.plan_id);
      assert.equal(Number(stored.match_score), plan.match_score);
      assert.equal(stored.rank_no, plan.rank_no);
      const timetable = await http("GET", `/plans/${plan.plan_id}/timetable`);
      assert.equal(timetable.status, 200);
      assert.equal(timetable.timetable_complete, true);
    }
  });
  await t.test("regeneration is deterministic and preserves selected, archived and manual plans", async () => {
    const selected = firstBatch[0].plan_id, archived = firstBatch[1].plan_id;
    assert.equal((await http("POST", `/plans/${selected}/select`)).status, 200);
    await pool.query("UPDATE plan SET status = 'ARCHIVED' WHERE plan_id = ?", [archived]);
    const manualId = await manual(multiRequest, "A", 101);
    const before = await snapshot(multiRequest);
    const result = await generate(multiRequest);
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.plans.map(key), firstBatch.map(key));
    const after = await snapshot(multiRequest);
    for (const planId of [selected, archived, manualId]) {
      assert.deepEqual(after.plans.find(p => p.plan_id === planId), before.plans.find(p => p.plan_id === planId));
    }
    assert.deepEqual(after.indexes.filter(i => before.indexes.some(old => old.plan_course_id === i.plan_course_id)), before.indexes);
    assert.deepEqual(result.data.retired_plan_ids, [firstBatch[2].plan_id]);
    assert.equal(after.plans.find(p => p.plan_id === firstBatch[2].plan_id).status, "ARCHIVED");
  });
  await t.test("no feasible timetable returns structured reasons without changing prior plans", async () => {
    const id = await request(["C", "E"]);
    await manual(id, "C", 301);
    await rejected(id, "NO_CLASH_FREE_COMBINATION");
    await rejected(await request([]), "NO_SELECTED_COURSES");
  });
  await t.test("blocked periods, hard avoided days and times reject candidates", async () => {
    const id = await request(["C"]);
    await preferences.addBlock(id, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:30" });
    const result = await rejected(id, "NO_VALID_INDEX");
    assert.equal(result.reasons[0].rejected_indexes[0].constraints.violations[0].code, "BLOCKED_PERIOD");
    await rejected(await request(["C"], { ...empty(), day_preferences: [hardDay("MON")] }), "NO_VALID_INDEX");
    await rejected(await request(["C"], { ...empty(), time_preferences: [hardTime("09:30", "11:00")] }), "NO_VALID_INDEX");
  });
  await t.test("hard whitelist/window rules, adjacency and contradictory persisted preferences", async () => {
    const id = await request(["A"], { ...empty(), day_preferences: [hardDay("MON", "PREFER"), hardDay("WED", "PREFER")],
      time_preferences: [hardTime("09:00", "10:00", "PREFER"), hardTime("13:00", "14:00", "PREFER"), hardTime("10:00", "11:00")] });
    const result = await generate(id);
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.plans.map(p => p.indexes[0].index_no), [101, 104]);
    await rejected(await request(["C"], { ...empty(), day_preferences: [hardDay("MON", "PREFER"), hardDay("MON")] }), "NO_VALID_INDEX");
    await rejected(await request(["C"], { ...empty(), time_preferences: [hardTime("09:00", "10:00", "PREFER"), hardTime("09:00", "10:00")] }), "NO_VALID_INDEX");
  });
  await t.test("soft preferences and objective priorities change live persisted rankings", async () => {
    const id = await request(["A"]);
    await preferences.replacePreferences(id, student, { ...empty(), day_preferences: [{ ...hardDay("TUE", "PREFER"), constraint_level: "SOFT" }] });
    assert.equal((await generate(id)).data.plans[0].indexes[0].index_no, 103);
    await preferences.replacePreferences(id, student, { ...empty(), time_preferences: [{ ...hardTime("13:00", "14:00", "PREFER"), constraint_level: "SOFT" }] });
    assert.equal((await generate(id)).data.plans[0].indexes[0].index_no, 104);
    // Fix B on Monday 10-11. A104 has one day/120min gap; A103 has two days/no gap.
    const priorityRequest = await request(["A", "B"]);
    const source = await manual(priorityRequest, "B", 201, true);
    // Compare A103 at 09-10 Tuesday versus A104 at 13-14 Monday; exclude
    // A101 via a Monday-only block and A102 via its clash with the locked B.
    await preferences.addBlock(priorityRequest, student, { day_of_week: "MON", start_time: "09:00", end_time: "10:00" });
    for (const [dayPriority, gapPriority, expected] of [[1, 10, 104], [10, 1, 103]]) {
      await preferences.replacePreferences(priorityRequest, student, { ...empty(), objectives: [
        { objective_type: "MINIMIZE_SCHOOL_DAYS", priority: dayPriority }, { objective_type: "MINIMIZE_GAPS", priority: gapPriority }] });
      const result = await generate(priorityRequest, { source_plan_id: source });
      assert.equal(result.status, 201, JSON.stringify(result));
      assert.equal(result.data.plans[0].indexes.find(i => i.course_code === codes.A).index_no, expected);
    }
  });
  await t.test("source locks are preserved and copied; unspecified or invalid source cannot bypass them", async () => {
    const id = await request(["A", "B"]);
    const source = await manual(id, "A", 103, true);
    const before = await snapshot(id);
    assert.equal((await generate(id)).code, "SOURCE_PLAN_REQUIRED");
    assert.equal((await generate(id, { source_plan_id: firstBatch[0].plan_id })).status, 404);
    const result = await generate(id, { source_plan_id: source });
    assert.equal(result.status, 201);
    assert.equal(result.data.plans.length, 2);
    for (const plan of result.data.plans) {
      assert.deepEqual(plan.indexes.find(i => i.course_code === codes.A), { course_code: codes.A, index_no: 103, locked: true });
      const [rows] = await pool.query("SELECT locked FROM plan_course WHERE plan_id = ? AND course_code = ?", [plan.plan_id, codes.A]);
      assert.equal(rows[0].locked, 1);
    }
    assert.deepEqual((await snapshot(id)).plans.find(p => p.plan_id === source), before.plans[0]);
  });
  await t.test("impossible locked index explains constraints and leaves source unchanged", async () => {
    const id = await request(["C", "E"]);
    const source = await manual(id, "C", 301, true);
    const before = await snapshot(id);
    let result = await generate(id, { source_plan_id: source });
    assert.equal(result.status, 422);
    assert.equal(result.reasons[0].code, "LOCKED_COMBINATION_INFEASIBLE");
    assert.deepEqual(await snapshot(id), before);
    await preferences.addBlock(id, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:00" });
    result = await generate(id, { source_plan_id: source });
    assert.equal(result.status, 422);
    assert.ok(result.reasons.some(reason => reason.code === "LOCKED_INDEX_INVALID" && reason.index_no === 301));
  });
  await t.test("missing/malformed slots, wrong term, academic ineligibility and mutual exclusions", async () => {
    for (const letter of ["N", "O", "T"]) await rejected(await request([letter]), "NO_VALID_INDEX");
    await rejected(await request(["I"]), "ACADEMIC_INELIGIBILITY");
    await rejected(await request(["M", "F"]), "ACADEMIC_INELIGIBILITY");
  });
  await t.test("corequisites use the complete plan course set; missing corequisite is infeasible", async () => {
    await rejected(await request(["K"]), "ACADEMIC_INELIGIBILITY");
    const result = await generate(await request(["K", "F"]));
    assert.equal(result.status, 201);
    assert.equal(result.data.plans.length, 1);
    assert.equal(result.data.plans[0].validation.eligibility.eligible, true);
  });
  await t.test("final selection of manual plans also enforces blocked periods and hard rules", async () => {
    const id = await request(["C"]);
    const plan = await manual(id, "C", 301);
    assert.equal((await http("GET", `/plans/${plan}/validation`)).data.can_finalize, true);
    await preferences.addBlock(id, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:00" });
    assert.equal((await http("POST", `/plans/${plan}/select`)).status, 422);
    await preferences.clearBlocks(id, student);
    await preferences.replacePreferences(id, student, { ...empty(), day_preferences: [hardDay("TUE", "PREFER")] });
    const result = await http("GET", `/plans/${plan}/validation`);
    assert.equal(result.data.can_finalize, false);
    assert.equal(result.data.constraints.violations[0].code, "HARD_PREFER_DAY");
    assert.equal((await http("POST", `/plans/${plan}/select`)).status, 422);
  });
  await t.test("failed insertion rolls back retirement and every new plan/index write", async () => {
    const id = await request(["C"]);
    await generate(id);
    const before = await snapshot(id);
    const db = await pool.getConnection();
    const originalGet = pool.getConnection, originalQuery = db.query, originalRelease = db.release;
    let insertedPlan = false, retiredPlan = false;
    const lockingStatements = [];
    pool.getConnection = async () => db;
    db.release = () => {};
    db.query = async function (sql, args) {
      if (sql.includes("FOR UPDATE")) lockingStatements.push(sql);
      if (sql.startsWith("INSERT INTO plan_course")) throw new Error("Injected index persistence failure");
      const result = await originalQuery.call(this, sql, args);
      if (sql.startsWith("INSERT INTO plan (")) insertedPlan = true;
      if (sql.startsWith("UPDATE plan SET status = 'ARCHIVED'")) retiredPlan = true;
      return result;
    };
    try {
      await assert.rejects(generation.generatePlans(id, student), /Injected index persistence failure/);
      assert.ok(insertedPlan && retiredPlan);
      assert.match(lockingStatements[0], /FROM planning_request/);
      assert.match(lockingStatements[1], /FROM plan WHERE/);
    } finally {
      pool.getConnection = originalGet; db.query = originalQuery; db.release = originalRelease; db.release();
    }
    assert.deepEqual(await snapshot(id), before);
  });
  await t.test("concurrent regeneration serializes without duplicate active batches", async () => {
    const id = await request(["D"]);
    const results = await Promise.all([generate(id), generate(id)]);
    assert.ok(results.every(r => r.status === 201));
    const stored = await snapshot(id);
    assert.equal(stored.plans.length, 4);
    assert.equal(stored.plans.filter(p => p.status === "GENERATED").length, 2);
    assert.equal(stored.plans.filter(p => p.status === "ARCHIVED").length, 2);
  });
  await t.test("identity, request scope, malformed bodies and reserved names", async () => {
    const id = await request(["C"]);
    await assert.rejects(generation.generatePlans(id, "OTHER"), { status: 404 });
    await assert.rejects(generation.generatePlans(id, null), { status: 401 });
    assert.equal((await generate(2147483647)).status, 404);
    assert.equal((await generate("abc")).status, 400);
    for (const body of [[], null, { student_id: student }, { source_plan_id: null }]) assert.equal((await generate(id, body)).status, 400);
    await assert.rejects(plans.createPlan(id, { plan_name: "AUTO Plan A #1" }), { status: 400 });
  });
});
