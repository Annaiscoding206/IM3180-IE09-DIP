// RUN_MYSQL_TESTS=1 node --test --test-concurrency=1 tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");

test("consistent validation, ownership, invalidation and selection over live MySQL/HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const plans = require("../src/services/planService");
  const preferences = require("../src/services/preferenceService");
  const audit = require("../src/services/degreeAuditService");
  const { updateAcademicProfile } = require("../src/services/studentProfileService");
  const { generatePlans } = require("../src/services/generationService");
  const { getAlternatives } = require("../src/services/alternativeIndexService");
  const prefix = "Z" + randomBytes(3).toString("hex").toUpperCase();
  const student = prefix + "S", other = prefix + "T", code = suffix => prefix + suffix;
  let server, authenticated = student, sequence = 0;
  const suffixes = ["A", "B", "C", "N", "O", "P", "R", "G", "H", "V"];
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query("DELETE FROM student WHERE student_id IN (?, ?)", [student, other]);
      await pool.query("DELETE FROM programme_curriculum WHERE programme = ?", [prefix]);
      await pool.query("DELETE FROM course_requirement WHERE course_code IN (?)", [suffixes.map(code)]);
      await pool.query("DELETE FROM course_info WHERE course_code IN (?)", [suffixes.map(code)]);
    } finally { await pool.end(); }
  });
  for (const id of [student, other]) await pool.query(`INSERT INTO student (student_id, student_name, programme, study_year, admission_year, admission_route)
    VALUES (?, 'Consistency test', ?, 3, 2024, 'DIRECT')`, [id, prefix]);
  for (const suffix of suffixes) {
    await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, 101, 'Validation test', 3, 'LETTER_GRADED', ?, 1)`, [code(suffix), suffix === "O" ? "2025-2026" : "2026-2027"]);
    if (suffix !== "N") await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time)
      VALUES (?, 101, 'LECTURE', 'TEST', ?, ?, ?)`, [code(suffix), ["H", "V"].includes(suffix) ? "TUE" : "MON",
        suffix === "B" ? "10:00:00" : suffix === "C" ? "09:30:00" : "09:00:00", suffix === "B" ? "11:00:00" : suffix === "C" ? "10:30:00" : "10:00:00"]);
  }
  await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
    VALUES (?, 102, 'Validation alternative', 3, 'LETTER_GRADED', '2026-2027', 1)`, [code("A")]);
  await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time)
    VALUES (?, 102, 'LECTURE', 'TEST', 'TUE', '09:00:00', '10:00:00')`, [code("A")]);
  await pool.query(`INSERT INTO course_requirement (course_code, required_course_code, requirement_type, requirement_group)
    VALUES (?, ?, 'PREREQUISITE', 1), (?, ?, 'COREQUISITE', 1)`, [code("R"), code("P"), code("G"), code("H")]);
  const [curr] = await pool.query(`INSERT INTO programme_curriculum (curriculum_key, title, programme, admission_year, admission_route, description)
    VALUES (?, 'Synthetic consistency test', ?, 2024, 'DIRECT', 'Synthetic rules')`, [prefix, prefix]);
  await pool.query("INSERT INTO curriculum_category (curriculum_id, category_code, title, required_au) VALUES (?, 'CORE', 'Test', 3)", [curr.insertId]);
  await pool.query(`INSERT INTO curriculum_course (curriculum_id, course_code, course_title, category_code, verified_min_study_year, verification_source)
    VALUES (?, ?, 'Verified demo rule', 'CORE', 2, 'Explicit synthetic rule')`, [curr.insertId, code("V")]);
  const attempt = result => ({ source_key: "demo:prerequisite", course_code: code("P"), course_title: "Test prerequisite",
    academic_year: "2025-2026", semester: 1, result, grade: null, earned_au: result === "PASSED" ? 3 : 0 });
  await audit.importDemoRecords(student, [attempt("PASSED")]);
  const express = require("express"), app = express();
  app.use(express.json());
  app.use((req, res, next) => { if (authenticated) res.locals.authenticatedStudentId = authenticated; next(); });
  app.use("/api/plans", require("../src/routes/planRoutes"));
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  async function http(method, route, body) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method,
      headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: res.status, ...await res.json() };
  }
  async function context(courses, owner = student, save = true) {
    const request = await plans.createRequest({ student_id: owner, academic_year: "2026-2027", semester: 1 });
    for (const suffix of courses) await plans.addCourseToRequest(request.request_id, code(suffix));
    const plan = await plans.createPlan(request.request_id, { plan_name: `Consistency ${++sequence}` });
    if (save) for (const suffix of courses) await plans.putIndex(plan.plan_id, code(suffix), { index_no: 101 });
    return { request_id: request.request_id, plan_id: plan.plan_id };
  }
  const state = async id => ({ plan: (await pool.query("SELECT * FROM plan WHERE plan_id = ?", [id]))[0],
    indexes: (await pool.query("SELECT * FROM plan_course WHERE plan_id = ? ORDER BY course_code", [id]))[0] });
  const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
  const day = (day_of_week, preference_type = "AVOID") => ({ day_of_week, preference_type, constraint_level: "HARD" });
  const time = (start_time, end_time, preference_type = "AVOID") => ({ start_time, end_time, preference_type, constraint_level: "HARD" });
  async function rankAndSelect(id) { await plans.selectPlan(id); await pool.query("UPDATE plan SET rank_no = 1, match_score = 99 WHERE plan_id = ?", [id]); }
  async function assertInvalidated(id) {
    const { plan } = await state(id); assert.equal(plan[0].status, "GENERATED"); assert.equal(plan[0].rank_no, null); assert.equal(plan[0].match_score, null);
  }

  await t.test("manual, preview, alternatives, generator and final validation enforce the same saved block", async () => {
    const c = await context(["A"]); await rankAndSelect(c.plan_id);
    await pool.query("UPDATE plan_course SET locked = TRUE WHERE plan_id = ?", [c.plan_id]);
    await preferences.addBlock(c.request_id, student, { day_of_week: "MON", start_time: "09:30", end_time: "10:30" });
    await assertInvalidated(c.plan_id);
    const before = await state(c.plan_id);
    const preview = await plans.previewIndex(c.plan_id, { course_code: code("A"), index_no: 101 });
    assert.equal(preview.can_save, false); assert.ok(preview.constraints.violations.some(v => v.code === "BLOCKED_PERIOD"));
    await assert.rejects(plans.putIndex(c.plan_id, code("A"), { index_no: 101 }), { status: 422 });
    await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
    const final = await plans.getPlanValidation(c.plan_id);
    assert.equal(final.can_finalize, false); assert.deepEqual(final.constraints, preview.constraints);
    await assert.rejects(generatePlans(c.request_id, student, { source_plan_id: c.plan_id }), e => e.status === 422 && e.details.reasons.some(r => r.code === "BLOCKED_PERIOD_CONFLICT"));
    const alternatives = await getAlternatives(c.plan_id, code("A"), student);
    assert.deepEqual(alternatives.alternatives.map(a => a.index_no), [102]);
    assert.equal(alternatives.auto_applied, false);
    assert.deepEqual(await state(c.plan_id), before);
    // Explicit user edits may replace a lock; no automated path does so.
    await plans.putIndex(c.plan_id, code("A"), { index_no: 102 });
    assert.equal((await state(c.plan_id)).indexes[0].locked, 1);
    assert.equal((await plans.getPlanValidation(c.plan_id)).can_finalize, true);
    assert.equal((await generatePlans(c.request_id, student, { source_plan_id: c.plan_id })).plans.length, 1);
    assert.equal((await plans.selectPlan(c.plan_id)).validation.can_finalize, true);
  });
  await t.test("manual edits cannot bypass HARD PREFER/AVOID day and time rules", async () => {
    for (const payload of [{ ...empty(), day_preferences: [day("MON")] }, { ...empty(), day_preferences: [day("TUE", "PREFER")] },
      { ...empty(), time_preferences: [time("09:30", "10:30")] }, { ...empty(), time_preferences: [time("11:00", "12:00", "PREFER")] }]) {
      const c = await context(["A"]); await rankAndSelect(c.plan_id);
      await preferences.replacePreferences(c.request_id, student, payload); await assertInvalidated(c.plan_id);
      const before = await state(c.plan_id);
      const preview = await plans.previewIndex(c.plan_id, { course_code: code("A"), index_no: 101 });
      assert.equal(preview.can_save, false); assert.equal(preview.constraints.valid, false);
      await assert.rejects(plans.putIndex(c.plan_id, code("A"), { index_no: 101 }), { status: 422 });
      await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
      assert.deepEqual(await state(c.plan_id), before);
    }
  });
  await t.test("manual clash rejection preserves rows; adjacent classes remain valid", async () => {
    const c = await context(["A", "B", "C"], student, false);
    await plans.putIndex(c.plan_id, code("A"), { index_no: 101 });
    await plans.putIndex(c.plan_id, code("B"), { index_no: 101 });
    const before = await state(c.plan_id);
    await assert.rejects(plans.putIndex(c.plan_id, code("C"), { index_no: 101 }), e => e.status === 422 && e.details.validation.conflicts.length > 0);
    assert.deepEqual(await state(c.plan_id), before);
    await plans.removeCourseFromRequest(c.request_id, code("C"));
    assert.equal((await plans.selectPlan(c.plan_id)).validation.can_finalize, true);
  });
  await t.test("incremental corequisites use can_select; final validation requires the actual corequisite index", async () => {
    const c = await context(["G"]);
    const validation = await plans.getPlanValidation(c.plan_id);
    assert.equal(validation.can_save, true); assert.equal(validation.can_finalize, false);
    assert.equal(validation.eligibility.courses[0].can_select, true);
    await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
    await plans.addCourseToRequest(c.request_id, code("H"));
    assert.equal((await plans.getPlanValidation(c.plan_id)).can_finalize, false);
    await plans.putIndex(c.plan_id, code("H"), { index_no: 101 });
    await plans.selectPlan(c.plan_id);
    await plans.removeIndex(c.plan_id, code("H")); await assertInvalidated(c.plan_id);
    await plans.removeCourseFromRequest(c.request_id, code("H"));
    assert.equal((await plans.getPlanValidation(c.plan_id)).can_finalize, false);
  });
  await t.test("completed and wrong-term courses cannot be selected", async () => {
    const c = await context([], student, false);
    for (const suffix of ["P", "O"]) await assert.rejects(plans.addCourseToRequest(c.request_id, code(suffix)), { status: 422 });
    assert.deepEqual((await plans.getRequest(c.request_id)).selected_courses, []);
  });
  await t.test("Degree Audit correction invalidates selected prerequisites and every subsequent validation path", async () => {
    const c = await context(["R"]); await rankAndSelect(c.plan_id);
    await audit.importDemoRecords(student, [attempt("FAILED")]);
    try {
      await assertInvalidated(c.plan_id);
      await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
      await assert.rejects(plans.putIndex(c.plan_id, code("R"), { index_no: 101 }), { status: 422 });
      const result = await http("GET", `/plans/${c.plan_id}`);
      assert.equal(result.data.active_selection, false); assert.equal(result.data.validation.can_finalize, false);
      assert.equal(result.data.validation.eligibility.courses[0].prerequisite_eligible, false);
    } finally { await audit.importDemoRecords(student, [attempt("PASSED")]); }
  });
  await t.test("academic profile updates invalidate verified year eligibility; no-op updates preserve metadata", async () => {
    const c = await context(["V"]); await rankAndSelect(c.plan_id);
    const before = await state(c.plan_id);
    assert.equal((await updateAcademicProfile(student, { study_year: 3 })).changed, false);
    assert.deepEqual(await state(c.plan_id), before);
    await updateAcademicProfile(student, { study_year: 1 });
    try {
      await assertInvalidated(c.plan_id);
      assert.equal((await plans.getPlanValidation(c.plan_id)).eligibility.courses[0].study_year_eligible, false);
      await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
    } finally { await updateAcademicProfile(student, { study_year: 3 }); }
    assert.equal((await plans.getPlan(c.plan_id)).status, "GENERATED", "Never automatically reselect after eligibility returns");
    await assert.rejects(updateAcademicProfile(student, { study_year: 0 }), { status: 400 });
  });
  await t.test("archived plans preserve metadata/indexes across preferences, blocks, academic/profile changes and edits", async () => {
    const c = await context(["B"]);
    await pool.query("UPDATE plan SET status = 'ARCHIVED', rank_no = 2, match_score = 80 WHERE plan_id = ?", [c.plan_id]);
    const before = await state(c.plan_id);
    await preferences.replacePreferences(c.request_id, student, { ...empty(), day_preferences: [day("MON")] });
    await preferences.addBlock(c.request_id, student, { day_of_week: "MON", start_time: "09:00", end_time: "12:00" });
    await audit.importDemoRecords(student, [attempt("FAILED")]);
    await audit.importDemoRecords(student, [attempt("PASSED")]);
    await updateAcademicProfile(student, { study_year: 2 }); await updateAcademicProfile(student, { study_year: 3 });
    await plans.removeCourseFromRequest(c.request_id, code("B"));
    for (const work of [() => plans.putIndex(c.plan_id, code("B"), { index_no: 101 }), () => plans.removeIndex(c.plan_id, code("B")), () => plans.selectPlan(c.plan_id)]) {
      await assert.rejects(work(), { status: 409 });
    }
    assert.deepEqual(await state(c.plan_id), before);
    const details = await plans.getPlanDetails(c.plan_id);
    assert.equal(details.selection_state, "ARCHIVED");
    assert.equal(details.validation.can_save, false);
    assert.equal((await plans.getPlanValidation(c.plan_id)).can_save, false);
  });
  await t.test("selected course and index changes clear stale metadata without deleting plans", async () => {
    const c = await context(["A"]); await rankAndSelect(c.plan_id);
    await plans.addCourseToRequest(c.request_id, code("B")); await assertInvalidated(c.plan_id);
    await plans.putIndex(c.plan_id, code("B"), { index_no: 101 }); await rankAndSelect(c.plan_id);
    await assert.rejects(plans.removeCourseFromRequest(c.request_id, code("A")), { status: 409 });
    await plans.putIndex(c.plan_id, code("A"), { index_no: 102 }); await assertInvalidated(c.plan_id);
    await rankAndSelect(c.plan_id); await plans.removeIndex(c.plan_id, code("B")); await assertInvalidated(c.plan_id);
    await plans.removeCourseFromRequest(c.request_id, code("B")); assert.equal((await plans.getIndexes(c.plan_id)).length, 1);
  });
  await t.test("plan detail/list distinguish a stale stored selection after out-of-band data changes", async () => {
    const c = await context(["A"]); await rankAndSelect(c.plan_id);
    const before = await state(c.plan_id);
    await pool.query(`INSERT INTO planning_blocked_period (request_id, day_of_week, start_time, end_time)
      VALUES (?, 'MON', '09:30:00', '10:30:00')`, [c.request_id]);
    const detail = await http("GET", `/plans/${c.plan_id}`);
    assert.equal(detail.status, 200); assert.equal(detail.data.stored_status, "SELECTED");
    assert.equal(detail.data.status, "GENERATED"); assert.equal(detail.data.selection_state, "STALE_INVALID");
    assert.equal(detail.data.active_selection, false); assert.equal(detail.data.rank_no, null);
    const list = await http("GET", `/planning-requests/${c.request_id}/plans`);
    assert.equal(list.data[0].selection_state, "STALE_INVALID"); assert.equal(list.data[0].validation.can_finalize, false);
    assert.deepEqual(await state(c.plan_id), before, "Retrieval is read-only and preserves stored history");
    await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
  });
  await t.test("missing timetable data, missing chosen indexes and wrong terms cannot be finalized or saved", async () => {
    const c = await context(["N"], student, false);
    await assert.rejects(plans.putIndex(c.plan_id, code("N"), { index_no: 101 }), { status: 422 });
    await assert.rejects(plans.selectPlan(c.plan_id), { status: 422 });
    await pool.query("INSERT INTO plan_course (plan_id, course_code, index_no) VALUES (?, ?, 101)", [c.plan_id, code("N")]);
    assert.equal((await plans.getPlanValidation(c.plan_id)).can_finalize, false);
    const valid = await context(["A"]);
    await pool.query("UPDATE planning_request SET academic_year = '2025-2026' WHERE request_id = ?", [valid.request_id]);
    await assert.rejects(plans.selectPlan(valid.plan_id), { status: 422 });
    await assert.rejects(plans.putIndex(valid.plan_id, code("A"), { index_no: 101 }), { status: 422 });
  });
  await t.test("every planning HTTP route rejects foreign request/plan IDs and spoofed root student IDs", async () => {
    const foreign = await context(["A"], other), before = await state(foreign.plan_id);
    const p = `/plans/${foreign.plan_id}`, r = `/planning-requests/${foreign.request_id}`, legacy = `/plans/${foreign.request_id}/courses`;
    const operations = [["GET", p], ["GET", p + "/indexes"], ["PUT", p + `/indexes/${code("A")}`, { index_no: 102 }],
      ["DELETE", p + `/indexes/${code("A")}`], ["GET", p + "/timetable"], ["GET", p + "/eligibility"], ["GET", p + "/validation"],
      ["GET", p + "/clashes"], ["POST", p + "/clash-check", { course_code: code("A"), index_no: 101 }], ["POST", p + "/select"],
      ["GET", p + `/indexes/${code("A")}/alternatives`], ["GET", r], ["GET", r + "/plans"], ["POST", r + "/plans", { plan_name: "Spoof" }],
      ["GET", legacy], ["POST", legacy, { course_code: code("B") }], ["DELETE", legacy + `/${code("A")}`],
      ["POST", r + "/generate-plans", {}], ["GET", r + "/preferences"], ["PUT", r + "/preferences", empty()],
      ["POST", r + "/blocked-periods", { day_of_week: "MON", start_time: "09:00", end_time: "10:00" }],
      ["GET", `/planning-requests?student_id=${other}`], ["POST", "/planning-requests", { student_id: other, academic_year: "2026-2027", semester: 1 }]];
    for (const [method, route, body] of operations) assert.equal((await http(method, route, body)).status, 404, `${method} ${route}`);
    assert.deepEqual(await state(foreign.plan_id), before);
    const previous = process.env.DEMO_PLANNING_ENABLED;
    authenticated = null; process.env.DEMO_PLANNING_ENABLED = "false";
    try { assert.equal((await http("GET", p)).status, 401); }
    finally { authenticated = student; if (previous === undefined) delete process.env.DEMO_PLANNING_ENABLED; else process.env.DEMO_PLANNING_ENABLED = previous; }
  });
  await t.test("profile mutation locks requests before plans and rolls back both data and metadata on failure", async () => {
    const c = await context(["V"]); await rankAndSelect(c.plan_id);
    const before = await state(c.plan_id);
    const db = await pool.getConnection(), get = pool.getConnection, query = db.query, release = db.release, sqls = [];
    pool.getConnection = async () => db; db.release = () => {};
    db.query = async function(sql, args) {
      sqls.push(sql);
      if (sql.startsWith("UPDATE plan SET rank_no")) throw Error("Injected invalidation failure");
      return query.call(this, sql, args);
    };
    try { await assert.rejects(updateAcademicProfile(student, { study_year: 1 }), /Injected invalidation failure/); }
    finally { pool.getConnection = get; db.query = query; db.release = release; db.release(); }
    const lock = sqls.findIndex(sql => sql.includes("FROM planning_request") && sql.includes("FOR UPDATE"));
    const write = sqls.findIndex(sql => sql.startsWith("UPDATE plan SET rank_no"));
    assert.ok(lock >= 0 && lock < write);
    assert.equal((await pool.query("SELECT study_year FROM student WHERE student_id = ?", [student]))[0][0].study_year, 3);
    assert.deepEqual(await state(c.plan_id), before);
  });
  await t.test("concurrent final selection and profile invalidation cannot leave an active invalid selection", async () => {
    const c = await context(["V"]); await rankAndSelect(c.plan_id);
    const results = await Promise.allSettled([plans.selectPlan(c.plan_id), updateAcademicProfile(student, { study_year: 1 })]);
    assert.equal(results[1].status, "fulfilled");
    await assertInvalidated(c.plan_id); assert.equal((await plans.getPlanDetails(c.plan_id)).active_selection, false);
    await updateAcademicProfile(student, { study_year: 3 });
  });
});
