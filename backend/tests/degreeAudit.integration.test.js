// RUN_MYSQL_TESTS=1 node --test tests/degreeAudit.integration.test.js
// Isolated attempts/students/courses; legacy migration is rerun idempotently.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");

test("Degree Audit authority, APIs and migration against MySQL/HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const audit = require("../src/services/degreeAuditService");
  const eligibility = require("../src/services/eligibilityService");
  const plans = require("../src/services/planService");
  const prefix = "D" + randomBytes(3).toString("hex").toUpperCase();
  const student = prefix + "S", other = prefix + "O", seedStudent = prefix + "T";
  const code = suffix => prefix + suffix;
  const createdStudents = [], courses = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      for (const id of createdStudents) await pool.query("DELETE FROM student WHERE student_id = ?", [id]);
      for (const c of courses) {
        await pool.query("DELETE FROM course_requirement WHERE course_code = ? OR required_course_code = ?", [c, c]);
        await pool.query("DELETE FROM course_info WHERE course_code = ?", [c]);
      }
      assert.equal((await pool.query("SELECT record_id FROM academic_record WHERE student_id = ?", [student]))[0].length, 0);
    } finally { await pool.end(); }
  });
  for (const id of [student, other, seedStudent]) {
    await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Degree Audit test', 'TEST', 3)", [id]);
    createdStudents.push(id);
  }
  for (const suffix of ["P", "F", "I", "L", "R", "Q", "C", "B"]) {
    await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, 101, 'Academic test', 3, 'LETTER_GRADED', '2026-2027', 1)`, [code(suffix)]);
    courses.push(code(suffix));
    await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time)
      VALUES (?, 101, 'LECTURE', 'TEST', 'MON', '09:00:00', '10:00:00')`, [code(suffix)]);
  }
  await pool.query("INSERT INTO course_requirement (course_code, required_course_code, requirement_type, requirement_group) VALUES (?, ?, 'PREREQUISITE', 1)", [code("Q"), code("P")]);
  const attempt = (key, suffix, result, earned_au, academic_year = "2025-2026", semester = 1) => ({
    source_key: `demo:${key}`, course_code: code(suffix), course_title: "Academic test",
    academic_year, semester, result, earned_au, grade: result === "IN_PROGRESS" ? null : result === "FAILED" ? "F" : "B",
  });
  const records = [attempt("passed", "P", "PASSED", 3), attempt("failed", "F", "FAILED", 0),
    attempt("progress", "I", "IN_PROGRESS", 0, "2026-2027"),
    attempt("later-1", "L", "FAILED", 0, "2024-2025", 2), attempt("later-2", "L", "PASSED", 4, "2025-2026", 2),
    attempt("repeat-1", "R", "PASSED", 3), attempt("repeat-2", "R", "PASSED", 3, "2026-2027")];
  await audit.importDemoRecords(student, records);
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use("/api/students", require("../src/routes/studentRoutes"));
  app.use("/api/courses", require("../src/routes/courseRoutes"));
  app.use("/api/plans", require("../src/routes/planRoutes"));
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(method, route, body) {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, ...await response.json() };
  }
  const get = query => http("GET", `/students/${student}/degree-audit${query || ""}`);
  async function request(owner = student) {
    return (await plans.createRequest({ student_id: owner, academic_year: "2026-2027", semester: 1 })).request_id;
  }
  async function chosen(suffix, owner = student) {
    const id = await request(owner);
    await plans.addCourseToRequest(id, code(suffix));
    const plan = await plans.createPlan(id, { plan_name: "Test plan" });
    await plans.putIndex(plan.plan_id, code(suffix), { index_no: 101 });
    await plans.selectPlan(plan.plan_id);
    await pool.query("UPDATE plan SET rank_no = 1, match_score = 95 WHERE plan_id = ?", [plan.plan_id]);
    return plan.plan_id;
  }
  const planRows = async owner => (await pool.query("SELECT p.* FROM plan p JOIN planning_request pr ON p.request_id = pr.request_id WHERE pr.student_id = ? ORDER BY p.plan_id", [owner]))[0];

  await t.test("retrieve all attempts, failed/later-passed history and deduplicated earned AU", async () => {
    const result = await get();
    assert.equal(result.status, 200);
    assert.equal(result.data.records.length, 7);
    assert.deepEqual(result.data.passed_course_codes, [code("L"), code("P"), code("R")]);
    assert.equal(result.data.earned_au, 10);
    assert.equal(result.data.earned_au_complete, true);
    assert.equal(result.data.summary.passed_attempts, 4);
    assert.equal(result.data.summary.failed_attempts, 2);
    assert.equal(result.data.summary.in_progress_attempts, 1);
    assert.equal(result.data.records.filter(row => row.course_code === code("L")).length, 2);
    assert.equal(result.data.records.filter(row => row.course_code === code("R")).length, 2);
  });
  await t.test("year, semester and result filters combine; overall and filtered summaries are explicit", async () => {
    assert.equal((await get("?academic_year=2024-2025")).data.records.length, 1);
    assert.equal((await get("?semester=2")).data.records.length, 2);
    const result = await get("?academic_year=2025-2026&semester=2&result=PASSED");
    assert.equal(result.data.records.length, 1);
    assert.equal(result.data.records[0].course_code, code("L"));
    assert.equal(result.data.filtered_summary.earned_au, 4);
    assert.equal(result.data.earned_au, 10, "Global earned AU is independent of display filters");
    assert.equal(result.data.summary_scope, "all_academic_records");
    assert.equal((await get("?result=FAILED")).data.filtered_summary.earned_au, 0);
    assert.equal((await get("?result=PASSED")).data.filtered_summary.earned_au, 10);
    assert.deepEqual((await get("?academic_year=2000-2001")).data.records, []);
  });
  await t.test("student profile preserves completed_courses and exposes matching Degree Audit summary", async () => {
    const profile = await http("GET", `/students/${student}`);
    const degree = (await get()).data;
    assert.equal(profile.status, 200);
    assert.equal(profile.data.student_id, student);
    assert.deepEqual(profile.data.completed_courses, degree.passed_course_codes);
    assert.deepEqual(profile.data.degree_audit_summary, degree.summary);
  });
  await t.test("eligibility uses PASSED authority; failed and in-progress records are not completion", async () => {
    for (const [suffix, completed] of [["P", true], ["L", true], ["R", true], ["F", false], ["I", false]]) {
      const result = await eligibility.evaluateEligibility(student, code(suffix));
      assert.equal(result.already_completed, completed);
      assert.equal(result.can_select, !completed);
    }
    assert.equal((await eligibility.evaluateEligibility(student, code("Q"))).prerequisite_eligible, true);
    // Proof that legacy table is no longer an independent authority.
    await pool.query("INSERT INTO completed_course (student_id, course_code) VALUES (?, ?)", [student, code("I")]);
    assert.equal((await eligibility.evaluateEligibility(student, code("I"))).already_completed, false);
    await pool.query("DELETE FROM completed_course WHERE student_id = ? AND course_code = ?", [student, code("I")]);
  });
  await t.test("backend selection rejects completed courses and accepts failed/in-progress courses", async () => {
    const id = await request();
    const result = await http("POST", `/plans/${id}/courses`, { course_code: code("P") });
    assert.equal(result.status, 422);
    assert.equal(result.already_completed, true);
    assert.equal((await pool.query("SELECT * FROM planning_request_course WHERE request_id = ?", [id]))[0].length, 0);
    for (const suffix of ["F", "I"]) assert.equal((await http("POST", `/plans/${id}/courses`, { course_code: code(suffix) })).status, 201);
  });
  await t.test("Course Explorer list and detail mark completion from the trusted student's records", async () => {
    const listed = await http("GET", `/courses?search=${prefix}`);
    assert.equal(listed.status, 200);
    const passed = listed.data.find(row => row.course_code === code("P"));
    assert.equal(passed.is_completed, true);
    assert.equal(passed.completion_status, "Completed");
    assert.equal(listed.data.find(row => row.course_code === code("F")).is_completed, false);
    assert.equal(listed.data.find(row => row.course_code === code("I")).is_completed, false);
    const detail = await http("GET", `/courses/${code("P")}?student_id=${other}`);
    assert.equal(detail.data.is_completed, true, "Query cannot override trusted identity");
    assert.ok(detail.data.indexes.length);
  });
  await t.test("academic changes invalidate finalized plans atomically and retain history/indexes", async () => {
    const plan = await chosen("F");
    const foreignPlan = await chosen("F", other);
    const foreignBefore = await planRows(other);
    const changed = await audit.importDemoRecords(student, [attempt("failed-then-pass", "F", "PASSED", 3, "2026-2027")]);
    assert.equal(changed.changed_records, 1);
    const stored = (await planRows(student)).find(row => row.plan_id === plan);
    assert.equal(stored.status, "GENERATED");
    assert.equal(stored.rank_no, null);
    assert.equal(stored.match_score, null);
    assert.equal((await plans.getPlanValidation(plan)).can_finalize, false);
    assert.equal((await http("POST", `/plans/${plan}/select`)).status, 422);
    assert.equal((await plans.getIndexes(plan)).length, 1);
    assert.equal((await audit.readRecords(student)).filter(row => row.course_code === code("F")).length, 2);
    assert.deepEqual(await planRows(other), foreignBefore);
    assert.equal((await plans.getPlan(foreignPlan)).status, "SELECTED");
    const generated = await http("POST", `/planning-requests/${stored.request_id}/generate-plans`, {});
    assert.equal(generated.status, 422);
    assert.ok(generated.reasons.some(row => row.code === "COURSE_ALREADY_COMPLETED"));
  });
  await t.test("idempotent import preserves valid selection; result corrections immediately affect prerequisites", async () => {
    const plan = await chosen("Q");
    const before = await planRows(student);
    assert.equal((await audit.importDemoRecords(student, records)).changed_records, 0);
    assert.deepEqual(await planRows(student), before);
    const failedPrerequisite = { ...records[0], result: "FAILED", grade: "F", earned_au: 0 };
    await audit.importDemoRecords(student, [failedPrerequisite]);
    assert.equal((await eligibility.evaluateEligibility(student, code("Q"))).prerequisite_eligible, false);
    assert.equal((await plans.getPlan(plan)).status, "GENERATED");
    await audit.importDemoRecords(student, [records[0]]);
    assert.equal((await eligibility.evaluateEligibility(student, code("Q"))).prerequisite_eligible, true);
    assert.equal((await plans.getPlan(plan)).status, "GENERATED", "Never automatically re-finalize");
  });
  await t.test("failed import rolls back academic data and metadata; request locks precede plan writes", async () => {
    const before = await audit.readRecords(student), plansBefore = await planRows(student);
    const db = await pool.getConnection();
    const originalGet = pool.getConnection, originalQuery = db.query, originalRelease = db.release;
    const queries = [];
    pool.getConnection = async () => db;
    db.release = () => {};
    db.query = async function (sql, args) {
      queries.push(sql);
      if (sql.includes("UPDATE plan SET rank_no")) throw new Error("Injected invalidation failure");
      return originalQuery.call(this, sql, args);
    };
    try {
      await assert.rejects(audit.importDemoRecords(student, [attempt("rollback", "B", "PASSED", 1.5)]), /Injected invalidation failure/);
      assert.ok(queries.some(sql => sql.startsWith("INSERT INTO academic_record")));
      const requestLock = queries.findIndex(sql => sql.includes("FROM planning_request") && sql.includes("FOR UPDATE"));
      const planWrite = queries.findIndex(sql => sql.includes("UPDATE plan SET rank_no"));
      assert.ok(requestLock >= 0 && requestLock < planWrite);
    } finally {
      pool.getConnection = originalGet; db.query = originalQuery; db.release = originalRelease; db.release();
    }
    assert.deepEqual(await audit.readRecords(student), before);
    assert.deepEqual(await planRows(student), plansBefore);
  });
  await t.test("concurrent final selection and completion import cannot leave a stale SELECTED plan", async () => {
    const plan = await chosen("B");
    await Promise.allSettled([plans.selectPlan(plan), audit.importDemoRecords(student, [attempt("concurrent-pass", "B", "PASSED", 1.5)])]);
    assert.equal((await plans.getPlan(plan)).status, "GENERATED");
    assert.equal((await plans.getPlanValidation(plan)).can_finalize, false);
  });
  await t.test("migration retains legacy rows and imports unknown metadata without fabrication; rerun is a no-op", async () => {
    const legacyPlan = await chosen("C");
    const archived = await plans.createPlan((await plans.getPlan(legacyPlan)).request_id, { plan_name: "Legacy archive" });
    await plans.putIndex(archived.plan_id, code("C"), { index_no: 101 });
    await pool.query("UPDATE plan SET status = 'ARCHIVED', rank_no = 2, match_score = 84 WHERE plan_id = ?", [archived.plan_id]);
    const archiveBefore = await plans.getPlan(archived.plan_id);
    await pool.query("INSERT INTO completed_course (student_id, course_code) VALUES (?, ?), (?, ?)", [student, code("H"), student, code("C")]);
    const beforeLegacy = (await pool.query("SELECT * FROM completed_course ORDER BY student_id, course_code"))[0];
    const sql = fs.readFileSync(path.resolve(__dirname, "../../database/08_degree_audit.sql"), "utf8").replace(/--[^\n]*/g, "");
    async function migrate() {
      const db = await pool.getConnection();
      try { for (const statement of sql.split(";").filter(s => s.trim())) await db.query(statement); }
      catch (error) { await db.rollback(); throw error; }
      finally { db.release(); }
    }
    await migrate();
    assert.deepEqual((await pool.query("SELECT * FROM completed_course ORDER BY student_id, course_code"))[0], beforeLegacy);
    const migrated = (await audit.readRecords(student)).filter(row => row.source === "LEGACY_COMPLETED");
    assert.equal(migrated.length, 2);
    for (const row of migrated) {
      assert.equal(row.result, "PASSED");
      for (const key of ["course_title", "academic_year", "semester", "grade", "earned_au"]) assert.equal(row[key], null);
    }
    assert.equal((await plans.getPlan(legacyPlan)).status, "GENERATED");
    assert.deepEqual(await plans.getPlan(archived.plan_id), archiveBefore, "Legacy migration preserves archived metadata");
    const auditBefore = await audit.readRecords(student), plansBefore = await planRows(student);
    await migrate();
    assert.deepEqual(await audit.readRecords(student), auditBefore);
    assert.deepEqual(await planRows(student), plansBefore);
    const summary = await audit.getCompletionSummary(student);
    assert.equal(summary.earned_au_complete, false);
    assert.ok(summary.unknown_au_course_codes.includes(code("H")));
  });
  await t.test("checked-in demo seeds are repeatable and retain distinct attempts", async () => {
    const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../database/09_degree_audit_demo_data.json"), "utf8"));
    assert.equal((await audit.importDemoRecords(seedStudent, seed.records)).changed_records, 6);
    const before = await audit.readRecords(seedStudent);
    const second = await audit.importDemoRecords(seedStudent, seed.records);
    assert.equal(second.changed_records, 0);
    assert.equal(second.summary.earned_au, 7);
    assert.deepEqual(await audit.readRecords(seedStudent), before);
  });
  await t.test("ownership, missing student, empty audit and malformed filters", async () => {
    assert.equal((await http("GET", `/students/${other}/degree-audit`)).status, 404);
    await assert.rejects(audit.getDegreeAudit(student, null), { status: 401 });
    await assert.rejects(audit.getDegreeAudit("UNKNOWN", "UNKNOWN"), { status: 404 });
    assert.deepEqual((await audit.getDegreeAudit(other, other)).records, []);
    for (const query of ["?semester=0", "?semester=1&semester=2", "?academic_year=2026", "?result=DONE", "?student_id=OTHER"]) {
      assert.equal((await get(query)).status, 400);
    }
    await assert.rejects(audit.importDemoRecords(student, [records[0], records[0]]), { status: 400 });
    await assert.rejects(audit.importDemoRecords(student, [{ ...records[0], course_code: code("B") }]), { status: 409 });
  });
});
