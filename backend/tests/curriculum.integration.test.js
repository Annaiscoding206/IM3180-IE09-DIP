// RUN_MYSQL_TESTS=1 node --test tests/curriculum.integration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");

test("Programme Curriculum matching, progress and integration over live MySQL/HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  const pool = require("../src/config/db");
  const audit = require("../src/services/degreeAuditService");
  const eligibility = require("../src/services/eligibilityService");
  const curriculum = require("../src/services/curriculumService");
  const plans = require("../src/services/planService");
  const { applyMigration, seedDemoCurriculum } = require("../scripts/setupCurriculum.cjs");
  const prefix = "K" + randomBytes(3).toString("hex").toUpperCase();
  const student = prefix + "S", other = prefix + "O", programme = prefix, code = s => prefix + s;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query("DELETE FROM student WHERE student_id IN (?, ?)", [student, other]);
      await pool.query("DELETE FROM programme_curriculum WHERE programme = ?", [programme]);
      await pool.query("DELETE FROM course_info WHERE course_code IN (?)", [["A", "B", "F", "I", "R", "V", "U", "E"].map(code)]);
    } finally { await pool.end(); }
  });
  for (const id of [student, other]) await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Curriculum test', ?, 2)", [id, programme]);
  for (const suffix of ["A", "B", "F", "I", "R", "V", "U", "E"]) {
    await pool.query(`INSERT INTO course_info (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, 101, 'Curriculum test', 3, 'LETTER_GRADED', '2026-2027', 1)`, [code(suffix)]);
    await pool.query(`INSERT INTO class_slots (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time)
      VALUES (?, 101, 'LECTURE', 'TEST', 'MON', '09:00:00', '10:00:00')`, [code(suffix)]);
  }
  const seed = { student_id: student,
    curriculum: { curriculum_key: prefix, title: "Synthetic test", programme, admission_year: 2024,
      admission_route: "DIRECT_ENTRY", is_demo: 1, description: "Synthetic test curriculum" },
    categories: [{ category_code: "CORE", title: "Core", required_au: 10 }, { category_code: "MPE", title: "Elective", required_au: 7 },
      { category_code: "ICC", title: "Common", required_au: 2 }, { category_code: "BDE", title: "Broadening", required_au: 3 }],
    groups: [{ category_code: "MPE", group_code: "OPTIONS", title: "Options", required_au: 7 }],
    courses: [["A", "CORE", 1], ["U", "CORE", 1], ["R", "CORE", 1], ["B", "MPE", 0], ["F", "MPE", 0],
      ["V", "MPE", 0], ["I", "BDE", 0], ["E", "ICC", 1]].map(([suffix, category_code, is_required]) => ({
      course_code: code(suffix), course_title: "Synthetic test", category_code, group_code: category_code === "MPE" ? "OPTIONS" : null,
      is_required, recommended_study_year: 6, recommended_semester: 2,
      verified_min_study_year: suffix === "V" ? 3 : null, verification_source: suffix === "V" ? "Explicit synthetic verified rule" : null })) };
  const seeded = await seedDemoCurriculum(pool, seed), curriculumId = seeded.curriculum_id;
  const attempt = (key, suffix, result, earned_au) => ({ source_key: "demo:" + key, course_code: code(suffix),
    course_title: "Synthetic test", academic_year: "2025-2026", semester: 1, result, grade: null, earned_au });
  await audit.importDemoRecords(student, [attempt("a1", "A", "PASSED", 3), attempt("a2", "A", "PASSED", 3),
    attempt("b1", "B", "FAILED", 0), attempt("b2", "B", "PASSED", 4), attempt("f", "F", "FAILED", 0),
    attempt("i", "I", "IN_PROGRESS", 0), attempt("u", "U", "PASSED", null)]);
  const request = async owner => (await plans.createRequest({ student_id: owner, academic_year: "2026-2027", semester: 1 })).request_id;
  const oldRequest = await request(student);
  await plans.addCourseToRequest(oldRequest, code("R"));
  const active = await request(student), foreign = await request(other);
  await plans.addCourseToRequest(active, code("F"));
  // Existing inconsistent data must not override academic completion status.
  await pool.query("INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)", [active, code("A")]);
  const express = require("express"), app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use("/api/students", require("../src/routes/studentRoutes"));
  app.use("/api/courses", require("../src/routes/courseRoutes"));
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(route, method = "GET", body) {
    const res = await fetch(base + route, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: res.status, ...await res.json() };
  }
  const get = (query = "") => http(`/students/${student}/curriculum/progress${query}`);

  await t.test("matches exact programme/cohort/route; both curriculum endpoints expose identity and progress", async () => {
    for (const suffix of ["", "/progress"]) {
      const response = await http(`/students/${student}/curriculum${suffix}`);
      assert.equal(response.status, 200);
      assert.equal(response.data.curriculum.curriculum_id, curriculumId);
      assert.equal(response.data.curriculum.is_demo, 1);
      assert.deepEqual(response.data.matching, { programme, admission_year: 2024, admission_route: "DIRECT_ENTRY" });
      assert.equal(response.data.categories.length, 4);
    }
  });
  await t.test("no matching cohort, route or programme returns explicit 404 without fallback", async () => {
    for (const [field, value] of [["admission_year", 2023], ["admission_route", "DIPLOMA"], ["programme", "OTHER"], ["admission_year", null], ["admission_route", null]]) {
      await pool.query(`UPDATE student SET ${field} = ? WHERE student_id = ?`, [value, student]);
      try {
        const result = await get(); assert.equal(result.status, 404); assert.equal(result.code, "NO_CURRICULUM");
      } finally { await pool.query(`UPDATE student SET ${field} = ? WHERE student_id = ?`, [seed.curriculum[field], student]); }
    }
  });
  await t.test("route-independent curriculum matches only when explicitly stored; ambiguous matches fail closed", async () => {
    await pool.query("UPDATE programme_curriculum SET admission_route = NULL WHERE curriculum_id = ?", [curriculumId]);
    await pool.query("UPDATE student SET admission_route = NULL WHERE student_id = ?", [student]);
    try { assert.equal((await get()).status, 200); }
    finally {
      await pool.query("UPDATE programme_curriculum SET admission_route = 'DIRECT_ENTRY' WHERE curriculum_id = ?", [curriculumId]);
      await pool.query("UPDATE student SET admission_route = 'DIRECT_ENTRY' WHERE student_id = ?", [student]);
    }
    const [insert] = await pool.query(`INSERT INTO programme_curriculum (curriculum_key, title, programme, admission_year, admission_route, description)
      VALUES (?, 'Ambiguous synthetic', ?, 2024, NULL, 'Test')`, [prefix + "AMB", programme]);
    try {
      const result = await get(); assert.equal(result.status, 409); assert.equal(result.code, "AMBIGUOUS_CURRICULUM");
      const rule = await eligibility.evaluateEligibility(student, code("R"));
      assert.equal(rule.can_select, false); assert.equal(rule.study_year_eligible, null); assert.equal(rule.requires_review, true);
      assert.equal((await http(`/students/${student}`)).data.curriculum_progress.code, "AMBIGUOUS_CURRICULUM");
    } finally { await pool.query("DELETE FROM programme_curriculum WHERE curriculum_id = ?", [insert.insertId]); }
  });
  await t.test("AU and required/elective requirements agree with Degree Audit; repeated attempts counted once", async () => {
    const { data } = await get();
    const degree = (await http(`/students/${student}/degree-audit`)).data;
    assert.deepEqual(data.degree_audit_summary, degree.summary);
    assert.equal(data.summary.required_au, 22); assert.equal(data.summary.completed_au, 7); assert.equal(data.summary.remaining_au, 15);
    assert.equal(data.summary.au_complete, false); assert.equal(data.summary.remaining_au_is_upper_bound, true);
    assert.deepEqual(data.summary.unknown_au_course_codes, [code("U")]);
    assert.deepEqual(data.summary.completed_required_courses.sort(), [code("A"), code("U")]);
    assert.deepEqual(data.summary.remaining_required_courses.sort(), [code("E"), code("R")]);
    const mpe = data.categories.find(c => c.category_code === "MPE");
    assert.equal(mpe.completed_au, 4); assert.equal(mpe.remaining_au, 3);
    assert.equal(mpe.elective_groups[0].completed_au, 4); assert.equal(mpe.elective_groups[0].remaining_au, 3);
    for (const suffix of ["F", "I"]) assert.equal(data.courses.find(c => c.course_code === code(suffix)).completed_au, 0);
  });
  await t.test("statuses and separate eligibility; recommendations never restrict an eligible course", async () => {
    const { data } = await get(), by = suffix => data.courses.find(c => c.course_code === code(suffix));
    assert.equal(by("A").status, "COMPLETED"); assert.equal(by("A").eligible, false);
    assert.equal(by("F").status, "PLANNED"); assert.equal(by("F").eligible, true);
    assert.equal(by("I").status, "NOT_YET_TAKEN"); assert.equal(by("I").eligible, true);
    assert.equal(by("R").status, "NOT_YET_TAKEN"); assert.equal(by("R").eligible, true);
    assert.equal(by("R").recommended_study_year, 6);
    assert.equal(by("R").eligibility.study_year_eligible, true);
    assert.equal(by("V").eligible, false); assert.equal(by("V").eligibility.study_year_eligible, false);
    assert.equal(data.planning_context.request.request_id, active);
    const old = await get(`?request_id=${oldRequest}`);
    assert.equal(old.data.courses.find(c => c.course_code === code("R")).status, "PLANNED");
    assert.equal(old.data.courses.find(c => c.course_code === code("F")).status, "NOT_YET_TAKEN");
  });
  await t.test("non-archived chosen plans contribute planned status; archived and other requests do not", async () => {
    const plan = await plans.createPlan(active, { plan_name: "Context test" });
    await pool.query("INSERT INTO plan_course (plan_id, course_code, index_no) VALUES (?, ?, 101)", [plan.plan_id, code("I")]);
    assert.equal((await get()).data.courses.find(c => c.course_code === code("I")).status, "PLANNED");
    await pool.query("UPDATE plan SET status = 'ARCHIVED' WHERE plan_id = ?", [plan.plan_id]);
    assert.equal((await get()).data.courses.find(c => c.course_code === code("I")).status, "NOT_YET_TAKEN");
  });
  await t.test("explicit verified minimum year propagates through selection, final validation and generation", async () => {
    await assert.rejects(plans.addCourseToRequest(active, code("V")), { status: 422 });
    const id = await request(student);
    await pool.query("INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)", [id, code("V")]);
    const plan = await plans.createPlan(id, { plan_name: "Year rule test" });
    await assert.rejects(plans.putIndex(plan.plan_id, code("V"), { index_no: 101 }), { status: 422 });
    assert.equal((await plans.getIndexes(plan.plan_id)).length, 0);
    const generation = await http(`/planning-requests/${id}/generate-plans`, "POST", {});
    assert.equal(generation.status, 422);
    assert.ok(generation.reasons.some(r => r.code === "COURSE_INELIGIBLE" && r.study_year_eligible === false));
    await pool.query("UPDATE student SET study_year = 3 WHERE student_id = ?", [student]);
    try {
      assert.equal((await eligibility.evaluateEligibility(student, code("V"))).can_select, true);
      await plans.putIndex(plan.plan_id, code("V"), { index_no: 101 });
      assert.equal((await plans.getPlanValidation(plan.plan_id)).can_finalize, true);
    } finally { await pool.query("UPDATE student SET study_year = 2 WHERE student_id = ?", [student]); }
    assert.equal((await plans.getPlanValidation(plan.plan_id)).can_finalize, false);
    await assert.rejects(plans.selectPlan(plan.plan_id), { status: 422 });
    await pool.query("DELETE FROM planning_request WHERE request_id = ?", [id]);
  });
  await t.test("student profile and Course Explorer add curriculum data without breaking completed fields", async () => {
    const profile = await http(`/students/${student}`), progress = await get();
    assert.equal(profile.data.admission_year, 2024); assert.equal(profile.data.admission_route, "DIRECT_ENTRY");
    assert.deepEqual(profile.data.curriculum_progress.summary, progress.data.summary);
    assert.deepEqual(profile.data.completed_courses, progress.data.degree_audit_summary.passed_course_codes);
    const list = await http(`/courses?search=${prefix}`);
    assert.equal(list.status, 200);
    assert.equal(list.data.find(c => c.course_code === code("A")).completion_status, "Completed");
    const planned = list.data.find(c => c.course_code === code("F"));
    assert.equal(planned.curriculum_status, "PLANNED"); assert.equal(planned.curriculum_category, "MPE");
    const detail = await http(`/courses/${code("R")}`);
    assert.equal(detail.data.curriculum_status, "NOT_YET_TAKEN"); assert.equal(detail.data.curriculum_category, "CORE");
    assert.ok(detail.data.indexes.length);
  });
  await t.test("ownership, absent student/request, malformed request filters", async () => {
    assert.equal((await http(`/students/${other}/curriculum`)).status, 404);
    assert.equal((await get(`?request_id=${foreign}`)).status, 404);
    assert.equal((await get("?request_id=2147483647")).status, 404);
    for (const query of ["?request_id=0", "?request_id=1&request_id=2", "?student_id=OTHER", "?request_id=1.5"]) assert.equal((await get(query)).status, 400);
    await assert.rejects(curriculum.getStudentCurriculum(student, null), { status: 401 });
    await assert.rejects(curriculum.getStudentCurriculum("NO_SUCH_STUDENT", "NO_SUCH_STUDENT"), { status: 404 });
    await assert.rejects(curriculum.getStudentCurriculum(other, other), { status: 404 });
  });
    await t.test("legacy Student APIs enforce authenticated student ownership", async () => {
    // The student-list endpoint must return only the authenticated student.
    const list = await http("/students");

    assert.equal(list.status, 200);
    assert.deepEqual(
      list.data.map(row => row.student_id),
      [student]
    );

    // The authenticated student can still access their own profile.
    const ownProfile = await http(`/students/${student}`);

    assert.equal(ownProfile.status, 200);
    assert.equal(ownProfile.data.student_id, student);

    // The authenticated student can still check their own eligibility.
    const ownEligibility = await http(
      `/students/${student}/eligibility/${code("F")}?request_id=${active}`
    );

    assert.equal(ownEligibility.status, 200);

    // Another student's profile must not be accessible.
    const foreignProfile = await http(`/students/${other}`);

    assert.equal(foreignProfile.status, 404);
    assert.equal(
      foreignProfile.message,
      "Student not found for this identity"
    );

    // Another student's eligibility must not be accessible,
    // even when that student's planning request ID is supplied.
    const foreignEligibility = await http(
      `/students/${other}/eligibility/${code("F")}?request_id=${foreign}`
    );

    assert.equal(foreignEligibility.status, 404);
    assert.equal(
      foreignEligibility.message,
      "Student not found for this identity"
    );
  });
  await t.test("database prevents credit double allocation and unverified minimum-year rules", async () => {
    await assert.rejects(pool.query(`INSERT INTO curriculum_course (curriculum_id, course_code, course_title, category_code)
      VALUES (?, ?, 'Duplicate bucket', 'BDE')`, [curriculumId, code("A")]), { code: "ER_DUP_ENTRY" });
    await assert.rejects(pool.query("UPDATE curriculum_course SET verified_min_study_year = 3 WHERE curriculum_id = ? AND course_code = ?", [curriculumId, code("R")]), { code: "ER_CHECK_CONSTRAINT_VIOLATED" });
  });
  await t.test("migration and checked-in demo seed are repeatable and retain original history", async () => {
    const legacy = (await pool.query("SELECT * FROM completed_course WHERE student_id = 'DEMO001' ORDER BY course_code"))[0];
    const history = await audit.readRecords("DEMO001");
    await applyMigration(pool); await applyMigration(pool);
    const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../database/11_programme_curriculum_demo_data.json"), "utf8"));
    assert.equal((await seedDemoCurriculum(pool, demo)).changed_rows, 0);
    assert.equal((await seedDemoCurriculum(pool, seed)).changed_rows, 0);
    assert.deepEqual(await audit.readRecords("DEMO001"), history);
    assert.deepEqual((await pool.query("SELECT * FROM completed_course WHERE student_id = 'DEMO001' ORDER BY course_code"))[0], legacy);
    const demoResult = await curriculum.getStudentCurriculum("DEMO001", "DEMO001");
    assert.equal(demoResult.curriculum.curriculum_key, demo.curriculum.curriculum_key);
    assert.equal(demoResult.courses.find(c => c.course_code === "DA6001").eligible, null, "No invented catalogue offering");
    assert.equal(demoResult.summary.completed_au, 7);
  });
  await t.test("seed no-op preserves plan metadata; failed seed rolls back and does not overwrite history", async () => {
    const plan = await plans.createPlan(oldRequest, { plan_name: "Seed preservation" });
    await plans.putIndex(plan.plan_id, code("R"), { index_no: 101 });
    await plans.selectPlan(plan.plan_id);
    await pool.query("UPDATE plan SET rank_no = 1, match_score = 90 WHERE plan_id = ?", [plan.plan_id]);
    const before = await plans.getPlan(plan.plan_id);
    assert.equal((await seedDemoCurriculum(pool, seed)).changed_rows, 0);
    assert.deepEqual(await plans.getPlan(plan.plan_id), before);
    const broken = structuredClone(seed);
    broken.categories.unshift({ category_code: "TEMP", title: "Rollback", required_au: 1 });
    broken.courses[0].course_title = "Conflicting seed edit";
    await assert.rejects(seedDemoCurriculum(pool, broken), /refusing to overwrite/);
    assert.equal((await pool.query("SELECT * FROM curriculum_category WHERE curriculum_id = ? AND category_code = 'TEMP'", [curriculumId]))[0].length, 0);
    assert.deepEqual(await plans.getPlan(plan.plan_id), before);
    const extended = structuredClone(seed);
    extended.categories.push({ category_code: "EXTRA", title: "New demo category", required_au: 0 });
    const changed = await seedDemoCurriculum(pool, extended);
    assert.equal(changed.changed_rows, 1);
    assert.ok(changed.invalidated_request_ids.includes(oldRequest));
    const invalidated = await plans.getPlan(plan.plan_id);
    assert.equal(invalidated.status, "GENERATED"); assert.equal(invalidated.rank_no, null); assert.equal(invalidated.match_score, null);
    assert.equal((await plans.getIndexes(plan.plan_id)).length, 1);
  });
});
