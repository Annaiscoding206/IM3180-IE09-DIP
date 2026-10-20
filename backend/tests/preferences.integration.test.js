// RUN_MYSQL_TESTS=1 node --test tests/preferences.integration.test.js
// Real HTTP/MySQL with isolated, temporary fixtures; no schema or seed changes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const path = require("node:path");

test("preference persistence against local MySQL and HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async (t) => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const service = require("../src/services/preferenceService");
  const express = require("express");
  const student = "P" + randomBytes(4).toString("hex");
  const otherStudent = student + "B";
  const students = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      for (const studentId of students) await pool.query("DELETE FROM student WHERE student_id = ?", [studentId]);
      const [remaining] = await pool.query("SELECT student_id FROM student WHERE student_id IN (?, ?)", [student, otherStudent]);
      assert.equal(remaining.length, 0);
    } finally { await pool.end(); }
  });
  for (const studentId of [student, otherStudent]) {
    await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Preference test', 'TEST', 3)", [studentId]);
    students.push(studentId);
  }
  async function makeRequest(studentId) {
    const [r] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [studentId]);
    return r.insertId;
  }
  const request = await makeRequest(student);
  const sibling = await makeRequest(student);
  const foreign = await makeRequest(otherStudent);
  for (const [id, name, status] of [[request, "Selected", "SELECTED"], [request, "Archived", "ARCHIVED"], [foreign, "Foreign", "SELECTED"]]) {
    await pool.query("INSERT INTO plan (request_id, plan_name, rank_no, match_score, status) VALUES (?, ?, 1, 95, ?)", [id, name, status]);
  }
  const app = express();
  app.use(express.json());
  // Trusted server fixture identity, not a user-controlled HTTP header.
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/planning-requests`;
  async function http(method, suffix, body, id = request) {
    const res = await fetch(`${base}/${id}/${suffix}`, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    return { status: res.status, ...await res.json() };
  }
  const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
  const payload = {
    day_preferences: [{ day_of_week: "MON", preference_type: "AVOID", constraint_level: "HARD" },
      { day_of_week: "FRI", preference_type: "PREFER", constraint_level: "SOFT" }],
    time_preferences: [{ start_time: "09:00", end_time: "10:00", preference_type: "AVOID", constraint_level: "SOFT" },
      { start_time: "12:00", end_time: "13:00", preference_type: "PREFER", constraint_level: "HARD" }],
    objectives: [{ objective_type: "MINIMIZE_SCHOOL_DAYS", priority: 1 }, { objective_type: "MINIMIZE_GAPS", priority: 2 }],
  };
  const block = { day_of_week: "TUE", start_time: "10:00", end_time: "11:00" };
  const metadata = async (id = request) => (await pool.query("SELECT plan_id, rank_no, match_score, status FROM plan WHERE request_id = ? ORDER BY plan_id", [id]))[0];
  async function rank() {
    await pool.query("UPDATE plan SET rank_no = 1, match_score = 95, status = IF(plan_name = 'Archived', 'ARCHIVED', 'SELECTED') WHERE request_id = ?", [request]);
  }
  async function invalidated() {
    const rows = await metadata();
    assert.equal(rows.length, 2, "Plans retained");
    assert.ok(rows.every(row => row.rank_no === null && row.match_score === null));
    assert.equal(rows[0].status, "GENERATED");
    assert.equal(rows[1].status, "ARCHIVED");
    assert.equal((await metadata(foreign))[0].rank_no, 1, "Other requests untouched");
  }

  await t.test("retrieve empty preferences and blocks", async () => {
    assert.deepEqual((await http("GET", "preferences")).data, { request_id: request, ...empty() });
    assert.deepEqual((await http("GET", "blocked-periods")).data.blocked_periods, []);
  });
  await t.test("save/reload day/time/objectives, HARD/SOFT, and invalidate all request plans", async () => {
    const saved = await http("PUT", "preferences", payload);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.changed, true);
    const { validatePreferences } = require("../src/services/preferenceValidation");
    const normalized = validatePreferences(payload);
    // Objective rows are returned in type order; priority is persisted data,
    // not an implied array position or input-order guarantee.
    normalized.objectives.sort((a, b) => a.objective_type.localeCompare(b.objective_type));
    assert.deepEqual((await http("GET", "preferences")).data, { request_id: request, ...normalized });
    await invalidated();
  });
  await t.test("equivalent reordered replacement preserves ranking and final selection", async () => {
    await rank();
    const before = await metadata();
    const reordered = Object.fromEntries(Object.entries(payload).map(([key, rows]) => [key, [...rows].reverse()]));
    const response = await http("PUT", "preferences", reordered);
    assert.equal(response.status, 200);
    assert.equal(response.data.changed, false);
    assert.deepEqual(await metadata(), before);
  });
  await t.test("replacement removes previous rows and empty arrays clear collections", async () => {
    assert.equal((await http("PUT", "preferences", { ...empty(), objectives: [payload.objectives[1]] })).status, 200);
    const current = (await http("GET", "preferences")).data;
    assert.deepEqual(current.day_preferences, []);
    assert.deepEqual(current.time_preferences, []);
    assert.deepEqual(current.objectives, [payload.objectives[1]]);
    await invalidated();
    assert.equal((await http("PUT", "preferences", empty())).status, 200);
    assert.deepEqual((await http("GET", "preferences")).data, { request_id: request, ...empty() });
  });
  await t.test("malformed/duplicate input fails without changing preferences or metadata", async () => {
    await http("PUT", "preferences", payload);
    await rank();
    const before = (await http("GET", "preferences")).data;
    const plans = await metadata();
    const invalid = [{}, { ...empty(), day_preferences: [{ ...payload.day_preferences[0], constraint_level: "UNSPECIFIED" }] },
      { ...empty(), time_preferences: [{ ...payload.time_preferences[0], end_time: "08:00" }] },
      { ...empty(), day_preferences: [payload.day_preferences[0], payload.day_preferences[0]] },
      { ...empty(), time_preferences: [payload.time_preferences[0], payload.time_preferences[0]] },
      { ...empty(), objectives: [payload.objectives[0], payload.objectives[0]] }];
    for (const body of invalid) assert.equal((await http("PUT", "preferences", body)).status, 400);
    assert.deepEqual((await http("GET", "preferences")).data, before);
    assert.deepEqual(await metadata(), plans);
  });
  await t.test("missing and foreign requests return 404 for every operation", async () => {
    for (const id of [2147483647, foreign]) {
      for (const [method, route, body] of [["GET", "preferences"], ["PUT", "preferences", empty()],
        ["GET", "blocked-periods"], ["POST", "blocked-periods", block], ["DELETE", "blocked-periods"], ["DELETE", "blocked-periods/1"]]) {
        assert.equal((await http(method, route, body, id)).status, 404);
      }
    }
    assert.equal((await http("GET", "preferences", undefined, "abc")).status, 400);
    await assert.rejects(service.getPreferences(request, undefined), { status: 401 });
    assert.equal((await http("PUT", "preferences", { ...empty(), student_id: otherStudent })).status, 400);
  });
  let blockId;
  await t.test("add and reload a block; duplicate blocked range rejected; ranks invalidated", async () => {
    const added = await http("POST", "blocked-periods", block);
    assert.equal(added.status, 201);
    blockId = added.data.block_id;
    assert.deepEqual((await http("GET", "blocked-periods")).data.blocked_periods, [added.data]);
    await invalidated();
    await rank();
    const before = await metadata();
    assert.equal((await http("POST", "blocked-periods", block)).status, 409);
    assert.deepEqual(await metadata(), before);
    assert.equal((await http("POST", "blocked-periods", { ...block, end_time: "09:00" })).status, 400);
    assert.equal((await http("GET", "blocked-periods")).data.blocked_periods.length, 1);
  });
  await t.test("block deletion is scoped to both request and owner", async () => {
    assert.equal((await http("DELETE", `blocked-periods/${blockId}`, undefined, sibling)).status, 404);
    assert.equal((await http("GET", "blocked-periods")).data.blocked_periods.length, 1);
    assert.equal((await http("DELETE", `blocked-periods/${blockId}`)).status, 200);
    assert.deepEqual((await http("GET", "blocked-periods")).data.blocked_periods, []);
    await invalidated();
    assert.equal((await http("DELETE", `blocked-periods/${blockId}`)).status, 404);
  });
  await t.test("clear blocks, preference replacement independence, and no-op clear", async () => {
    await http("POST", "blocked-periods", block);
    await http("POST", "blocked-periods", { ...block, day_of_week: "SUN" });
    await http("PUT", "preferences", empty());
    assert.equal((await http("GET", "blocked-periods")).data.blocked_periods.length, 2);
    await rank();
    assert.equal((await http("DELETE", "blocked-periods")).data.removed_count, 2);
    await invalidated();
    await rank();
    const before = await metadata();
    assert.equal((await http("DELETE", "blocked-periods")).data.removed_count, 0);
    assert.deepEqual(await metadata(), before);
  });
  await t.test("database failure after partial replacement rolls back all collections", async () => {
    await http("PUT", "preferences", payload);
    await rank();
    const before = (await http("GET", "preferences")).data;
    const plans = await metadata();
    const db = await pool.getConnection();
    const originalGet = pool.getConnection;
    const originalQuery = db.query;
    const originalRelease = db.release;
    let insertedDay = false;
    pool.getConnection = async () => db;
    db.release = () => {};
    db.query = async function (sql, args) {
      if (sql.startsWith("INSERT INTO planning_time_preference")) throw new Error("Injected persistence failure");
      const result = await originalQuery.call(this, sql, args);
      if (sql.startsWith("INSERT INTO planning_day_preference")) insertedDay = true;
      return result;
    };
    try {
      await assert.rejects(service.replacePreferences(request, student, {
        ...payload,
        day_preferences: [{ ...payload.day_preferences[0], day_of_week: "SUN" }],
        time_preferences: [{ ...payload.time_preferences[0], start_time: "08:00" }],
      }), /Injected persistence failure/);
      assert.equal(insertedDay, true, "Failure occurs after a real write, not during prevalidation");
    } finally {
      pool.getConnection = originalGet;
      db.query = originalQuery;
      db.release = originalRelease;
      db.release();
    }
    assert.deepEqual((await http("GET", "preferences")).data, before);
    assert.deepEqual(await metadata(), plans);
  });
  await t.test("failure after ranking invalidation rolls back preferences and plan metadata together", async () => {
    const before = (await http("GET", "preferences")).data;
    const plans = await metadata();
    const db = await pool.getConnection();
    const originalGet = pool.getConnection;
    const originalQuery = db.query;
    const originalRelease = db.release;
    let updatedPlans = false;
    pool.getConnection = async () => db;
    db.release = () => {};
    db.query = async function (sql, args) {
      if (sql.startsWith("UPDATE planning_request SET")) throw new Error("Injected invalidation failure");
      const result = await originalQuery.call(this, sql, args);
      if (sql.startsWith("UPDATE plan SET")) updatedPlans = true;
      return result;
    };
    try {
      await assert.rejects(service.replacePreferences(request, student, empty()), /Injected invalidation failure/);
      assert.equal(updatedPlans, true);
    } finally {
      pool.getConnection = originalGet;
      db.query = originalQuery;
      db.release = originalRelease;
      db.release();
    }
    assert.deepEqual((await http("GET", "preferences")).data, before);
    assert.deepEqual(await metadata(), plans);
  });
  await t.test("database enforces block time check and request foreign key", async () => {
    await assert.rejects(pool.query("INSERT INTO planning_blocked_period (request_id, day_of_week, start_time, end_time) VALUES (?, 'MON', '11:00', '10:00')", [request]),
      error => error.code === "ER_CHECK_CONSTRAINT_VIOLATED");
    await assert.rejects(pool.query("INSERT INTO planning_blocked_period (request_id, day_of_week, start_time, end_time) VALUES (2147483647, 'MON', '10:00', '11:00')"),
      error => error.code === "ER_NO_REFERENCED_ROW_2");
  });
});
