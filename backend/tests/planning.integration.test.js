// Opt in: RUN_MYSQL_TESTS=1 node --test backend/tests/planning.integration.test.js
// Uses backend/.env, real HTTP, and temporary rows with unique identifiers.
// No schema/seed changes. Cleanup deletes only this run's fixture rows.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const path = require("node:path");

test("planning APIs against local MySQL and HTTP", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async (t) => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db", "Use the configured project database");
  const pool = require("../src/config/db");
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = studentId; next(); });
  app.use("/api/planning-requests", require("../src/routes/planningRequestRoutes"));
  app.use("/api/plans", require("../src/routes/planRoutes"));
  app.use("/api/courses", require("../src/routes/courseRoutes"));
  const prefix = "T" + randomBytes(3).toString("hex").toUpperCase();
  const studentId = prefix + "S";
  const codes = Object.fromEntries(["A", "B", "C", "N", "U", "I", "Y", "X", "M"].map((letter) => [letter, prefix + letter]));
  let server;
  let requestId;
  let counter = 0;
  const createdStudent = { value: false };
  const createdCourses = [];
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      // Student deletion cascades this run's requests, plans, and plan_course rows.
      if (createdStudent.value) await pool.query("DELETE FROM student WHERE student_id = ?", [studentId]);
      for (const code of createdCourses) {
        await pool.query(
          "DELETE FROM mutual_exclusion WHERE course_code = ? OR excluded_course_code = ?",
          [code, code]
        );
        await pool.query("DELETE FROM programme_restriction WHERE course_code = ?", [code]);
        await pool.query("DELETE FROM course_info WHERE course_code = ?", [code]);
      }
      const [students] = await pool.query("SELECT student_id FROM student WHERE student_id = ?", [studentId]);
      assert.equal(students.length, 0, "Temporary student and dependent plans removed");
      if (createdCourses.length) {
        const [rows] = await pool.query("SELECT course_code FROM course_info WHERE course_code IN (?)", [createdCourses]);
        assert.equal(rows.length, 0, "Temporary courses and slots removed");
      }
    } finally { await pool.end(); }
  });

  await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, ?, ?, ?)",
    [studentId, "Temporary planning API test", "TEST_PROGRAMME", 3]);
  createdStudent.value = true;
  async function course(letter, indexNo, semester = 1, year = "2026-2027") {
    const code = codes[letter];
    await pool.query(`INSERT INTO course_info
      (course_code, index_no, course_name, au, grading_type, academic_year, semester)
      VALUES (?, ?, ?, 3, 'LETTER_GRADED', ?, ?)`, [code, indexNo, "Temporary planning test", year, semester]);
    if (!createdCourses.includes(code)) createdCourses.push(code);
  }
  for (const [letter, indexNo] of [["A", 101], ["A", 102], ["A", 103], ["B", 201], ["C", 301], ["N", 401], ["U", 501], ["I", 601], ["M", 901]]) {
    await course(letter, indexNo);
  }
  await course("Y", 701, 1, "2025-2026");
  await course("X", 801, 2);
  async function slot(letter, indexNo, day, start, end, weeks = null) {
    await pool.query(`INSERT INTO class_slots
      (course_code, index_no, class_type, class_group, day_of_week, start_time, end_time, teaching_weeks)
      VALUES (?, ?, 'LECTURE', 'TEST', ?, ?, ?, ?)`, [codes[letter], indexNo, day, start, end, weeks]);
  }
  await slot("A", 101, "MON", "09:00:00", "10:00:00");
  await slot("A", 102, "WED", "09:00:00", "10:00:00");
  await slot("A", 103, "MON", "09:30:00", "10:30:00");
  await slot("B", 201, "MON", "10:00:00", "11:00:00");
  await slot("C", 301, "MON", "09:30:00", "10:30:00");
  await slot("I", 601, "TUE", "09:00:00", "10:00:00");
  await slot("M", 901, "THU", "09:00:00", "10:00:00", "odd");
  await pool.query(`INSERT INTO programme_restriction (course_code, programme, restriction_type)
    VALUES (?, 'TEST_PROGRAMME', 'NOT_AVAILABLE')`, [codes.I]);

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(method, route, body) {
    const response = await fetch(base + route, {
      method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() };
  }
  const put = (planId, letter, indexNo) => http("PUT", `/plans/${planId}/indexes/${codes[letter]}`, { index_no: indexNo });
  const rows = async (planId) => (await pool.query("SELECT * FROM plan_course WHERE plan_id = ? ORDER BY course_code", [planId]))[0];
  async function newPlan() {
    const response = await http("POST", `/planning-requests/${requestId}/plans`, { plan_name: `Test ${++counter}` });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.data.plan_id;
  }
  async function rejectedUnchanged(planId, letter, indexNo, expectedStatus) {
    const before = await rows(planId);
    const response = await put(planId, letter, indexNo);
    assert.equal(response.status, expectedStatus, JSON.stringify(response.body));
    assert.deepEqual(await rows(planId), before, "Rejected write must not modify plan_course");
    return response;
  }

  await t.test("create, list and retrieve planning requests", async () => {
    const created = await http("POST", "/planning-requests", {
      student_id: studentId, academic_year: "2026-2027", semester: 1, target_au: 12,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    requestId = created.body.data.request_id;
    assert.equal(created.body.data.student_id, studentId);
    const listed = await http("GET", `/planning-requests?student_id=${studentId}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.count, 1);
    assert.equal(listed.body.data[0].request_id, requestId);
    const detail = await http("GET", `/planning-requests/${requestId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.target_au, 12);
    assert.equal((await http("GET", "/planning-requests")).status, 400);
    assert.equal((await http("POST", "/planning-requests", { student_id: studentId, academic_year: "2026-2027", semester: 4 })).status, 400);
    assert.equal((await http("GET", `/planning-requests?student_id=${prefix}NONE`)).status, 404);
  });
  assert.ok(requestId, "Request creation is required for remaining cases");
    await t.test("selected courses validates IDs and returns an empty list", async () => {
    const invalid = await http("GET", "/plans/abc/courses");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.success, false);

    const missing = await http("GET", "/plans/2147483647/courses");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Planning request not found");

    const empty = await http("GET", `/plans/${requestId}/courses`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, {
      success: true,
      count: 0,
      data: [],
    });
  });
  // Fixtures intentionally include an ineligible selection to prove index writes
  // cannot bypass eligibility even if older/imported request selections exist.
  for (const [letter, code] of Object.entries(codes)) {
    if (letter !== "U") await pool.query("INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)", [requestId, code]);
  }   await t.test("selected courses returns the request's courses in order", async () => {
    const response = await http("GET", `/plans/${requestId}/courses`);

    const expectedCodes = Object.entries(codes)
      .filter(([letter]) => letter !== "U")
      .map(([, code]) => code)
      .sort();

    assert.equal(response.status, 200);
    assert.equal(response.body.count, expectedCodes.length);
    assert.deepEqual(
      response.body.data.map((row) => row.course_code),
      expectedCodes
    );
    assert.ok(
      response.body.data.every((row) => row.request_id === requestId)
    );
  });

  await t.test("create/list/detail plans; duplicate name returns 409", async () => {
    const planId = await newPlan();
    const listed = await http("GET", `/planning-requests/${requestId}/plans`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.data.some((plan) => plan.plan_id === planId));
    const detail = await http("GET", `/plans/${planId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.request_id, requestId);
    assert.equal((await http("POST", `/planning-requests/${requestId}/plans`, { plan_name: detail.body.data.plan_name })).status, 409);
    assert.equal((await http("GET", `/plans/${planId}/indexes`)).body.count, 0);
  });

  await t.test("add valid index and retrieve it through Anna's timetable API", async () => {
    const planId = await newPlan();
    const result = await put(planId, "A", 101);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const indexed = await http("GET", `/plans/${planId}/indexes`);
    assert.equal(indexed.body.count, 1);
    assert.equal(indexed.body.data[0].index_no, 101);
    const timetable = await http("GET", `/plans/${planId}/timetable`);
    assert.equal(timetable.status, 200);
    assert.equal(timetable.body.data[0].course_code, codes.A);
    const courseTimetable = await http("GET", `/courses/${codes.A}/indexes/101/timetable`);
    assert.equal(courseTimetable.status, 200);
    assert.equal(courseTimetable.body.count, 1);
  });

  await t.test("replace index excludes the old overlapping index and preserves locked", async () => {
    const planId = await newPlan();
    assert.equal((await put(planId, "A", 101)).status, 201);
    await pool.query("UPDATE plan_course SET locked = TRUE WHERE plan_id = ?", [planId]);
    const preview = await http("POST", `/plans/${planId}/clash-check`, { course_code: codes.A, index_no: 103 });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.can_save, true);
    assert.equal((await put(planId, "A", 103)).status, 200);
    const stored = await rows(planId);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].index_no, 103);
    assert.equal(stored[0].locked, 1);
  });

  await t.test("remove chosen index without removing request-level selection", async () => {
    const planId = await newPlan();
    await put(planId, "A", 101);
    assert.equal((await http("DELETE", `/plans/${planId}/indexes/${codes.A}`)).status, 200);
    assert.equal((await rows(planId)).length, 0);
    assert.equal((await http("DELETE", `/plans/${planId}/indexes/${codes.A}`)).status, 404);
    const selection = await http("GET", `/plans/${requestId}/courses`);
    assert.ok(selection.body.data.some((row) => row.course_code === codes.A));
  });

  await t.test("reject course not selected in parent request", async () => {
    await rejectedUnchanged(await newPlan(), "U", 501, 422);
  });
  await t.test("reject wrong course/index pair", async () => {
    await rejectedUnchanged(await newPlan(), "A", 201, 404);
  });
  await t.test("reject wrong academic year and semester", async () => {
    const planId = await newPlan();
    await rejectedUnchanged(planId, "Y", 701, 422);
    await rejectedUnchanged(planId, "X", 801, 422);
  });
  await t.test("overlap preview does not save; overlapping PUT is rejected", async () => {
    const planId = await newPlan();
    await put(planId, "A", 101);
    const before = await rows(planId);
    const preview = await http("POST", `/plans/${planId}/clash-check`, { course_code: codes.C, index_no: 301 });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.status, "conflict");
    assert.equal(preview.body.data.conflicts[0].certainty, "potential");
    assert.deepEqual(await rows(planId), before);
    await rejectedUnchanged(planId, "C", 301, 422);
  });
  await t.test("adjacent classes can both be saved", async () => {
    const planId = await newPlan();
    assert.equal((await put(planId, "A", 101)).status, 201);
    assert.equal((await put(planId, "B", 201)).status, 201);
    const result = await http("GET", `/plans/${planId}/clashes`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.status, "clear");
  });
  await t.test("missing slots and unsupported weeks produce incomplete validation", async () => {
    const planId = await newPlan();
    const missing = await rejectedUnchanged(planId, "N", 401, 422);
    assert.equal(missing.body.validation.status, "incomplete");
    assert.equal(missing.body.validation.missing_slot_indexes[0].course_code, codes.N);
    const malformed = await rejectedUnchanged(planId, "M", 901, 422);
    assert.equal(malformed.body.validation.status, "incomplete");
  });
  await t.test("reject ineligible index with existing eligibility service", async () => {
    const result = await rejectedUnchanged(await newPlan(), "I", 601, 422);
    assert.equal(result.body.eligibility.programme_eligible, false);
  });
  await t.test("failed replacement preserves original row and plan metadata", async () => {
    const planId = await newPlan();
    await put(planId, "A", 102);
    await put(planId, "B", 201);
    await pool.query("UPDATE plan SET rank_no = 2, match_score = 85 WHERE plan_id = ?", [planId]);
    await rejectedUnchanged(planId, "A", 103, 422);
    const [plans] = await pool.query("SELECT rank_no, match_score FROM plan WHERE plan_id = ?", [planId]);
    assert.equal(plans[0].rank_no, 2);
    assert.equal(Number(plans[0].match_score), 85);
  });
  await t.test("stored-plan checks identify conflicts and missing indexes", async () => {
    const planId = await newPlan();
    await pool.query("INSERT INTO plan_course (plan_id, course_code, index_no) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)",
      [planId, codes.A, 101, planId, codes.C, 301, planId, codes.N, 401]);
    const result = await http("GET", `/plans/${planId}/clashes`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.status, "incomplete");
    assert.equal(result.body.data.conflicts.length, 1);
    assert.equal(result.body.data.missing_slot_indexes.length, 1);
  });
  await t.test("concurrent conflicting PUTs serialize: exactly one succeeds", async () => {
    const planId = await newPlan();
    const results = await Promise.all([put(planId, "A", 101), put(planId, "C", 301)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 422]);
    assert.equal((await rows(planId)).length, 1);
  });
    await t.test("final selection requires a complete valid plan and resets after edits", async () => {
    // Separate request using this test run's temporary student and courses.
    const createdRequest = await http("POST", "/planning-requests", {
      student_id: studentId,
      academic_year: "2026-2027",
      semester: 1,
    });

    assert.equal(createdRequest.status, 201);
    const selectionRequestId = createdRequest.body.data.request_id;

    for (const code of [codes.A, codes.B]) {
      const added = await http(
        "POST",
        `/plans/${selectionRequestId}/courses`,
        { course_code: code }
      );
      assert.equal(added.status, 201, JSON.stringify(added.body));
    }

    const createdPlan = await http(
      "POST",
      `/planning-requests/${selectionRequestId}/plans`,
      { plan_name: "Final selection regression" }
    );
    assert.equal(createdPlan.status, 201);
    const planId = createdPlan.body.data.plan_id;

    // An empty plan cannot be selected.
    let selected = await http("POST", `/plans/${planId}/select`);
    assert.equal(selected.status, 422);
    assert.equal(selected.body.validation.can_finalize, false);
    assert.equal(selected.body.validation.eligibility.empty_plan, true);

    // A partial plan cannot be selected.
    assert.equal((await put(planId, "A", 101)).status, 201);

    selected = await http("POST", `/plans/${planId}/select`);
    assert.equal(selected.status, 422);
    assert.deepEqual(
      selected.body.validation.eligibility.missing_index_courses,
      [codes.B]
    );

    // Both indexes are present and their classes are adjacent.
    assert.equal((await put(planId, "B", 201)).status, 201);

    const validation = await http("GET", `/plans/${planId}/validation`);
    assert.equal(validation.status, 200);
    assert.equal(validation.body.data.can_finalize, true);

    selected = await http("POST", `/plans/${planId}/select`);
    assert.equal(selected.status, 200);
    assert.equal(selected.body.data.status, "SELECTED");

    let detail = await http("GET", `/plans/${planId}`);
    assert.equal(detail.body.data.status, "SELECTED");

    // Removing an index clears SELECTED.
    const removed = await http(
      "DELETE",
      `/plans/${planId}/indexes/${codes.B}`
    );
    assert.equal(removed.status, 200);

    detail = await http("GET", `/plans/${planId}`);
    assert.equal(detail.body.data.status, "GENERATED");

    // Rejected selection must leave the status unchanged.
    selected = await http("POST", `/plans/${planId}/select`);
    assert.equal(selected.status, 422);

    detail = await http("GET", `/plans/${planId}`);
    assert.equal(detail.body.data.status, "GENERATED");

    // Restore and select again.
    assert.equal((await put(planId, "B", 201)).status, 201);
    assert.equal(
      (await http("POST", `/plans/${planId}/select`)).status,
      200
    );

    // Replacing an index also clears SELECTED.
    assert.equal((await put(planId, "A", 102)).status, 200);

    detail = await http("GET", `/plans/${planId}`);
    assert.equal(detail.body.data.status, "GENERATED");

    // The edited plan remains valid and can be selected again.
    selected = await http("POST", `/plans/${planId}/select`);
    assert.equal(selected.status, 200);
    assert.equal(selected.body.data.validation.can_finalize, true);
  });

    await t.test("concurrent mutually exclusive course additions allow only one", async () => {
    const created = await http("POST", "/planning-requests", {
      student_id: studentId,
      academic_year: "2026-2027",
      semester: 1,
    });

    assert.equal(created.status, 201);
    const conflictRequestId = created.body.data.request_id;

    await pool.query(
      `INSERT INTO mutual_exclusion
         (course_code, excluded_course_code)
       VALUES (?, ?)`,
      [codes.A, codes.B]
    );

    try {
      const responses = await Promise.all([
        http("POST", `/plans/${conflictRequestId}/courses`, {
          course_code: codes.A,
        }),
        http("POST", `/plans/${conflictRequestId}/courses`, {
          course_code: codes.B,
        }),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [201, 422],
        JSON.stringify(responses)
      );

      const rejected = responses.find(
        (response) => response.status === 422
      );
      assert.equal(rejected.body.mutual_exclusion_eligible, false);
      assert.equal(rejected.body.can_select, false);

      const selected = await http(
        "GET",
        `/plans/${conflictRequestId}/courses`
      );

      assert.equal(selected.status, 200);
      assert.equal(selected.body.count, 1);

      assert.deepEqual(
        rejected.body.conflicting_selected_courses,
        [selected.body.data[0].course_code]
      );
    } finally {
      await pool.query(
        `DELETE FROM mutual_exclusion
         WHERE course_code = ? AND excluded_course_code = ?`,
        [codes.A, codes.B]
      );
    }
  });

    await t.test("switching and concurrent selection leave one selected plan", async () => {
    const created = await http("POST", "/planning-requests", {
      student_id: studentId,
      academic_year: "2026-2027",
      semester: 1,
    });
    assert.equal(created.status, 201);
    const selectionRequestId = created.body.data.request_id;

    const added = await http(
      "POST",
      `/plans/${selectionRequestId}/courses`,
      { course_code: codes.A }
    );
    assert.equal(added.status, 201);

    const planIds = [];

    for (const name of ["Selection A", "Selection B"]) {
      const response = await http(
        "POST",
        `/planning-requests/${selectionRequestId}/plans`,
        { plan_name: name }
      );
      assert.equal(response.status, 201);

      const planId = response.body.data.plan_id;
      planIds.push(planId);
      assert.equal((await put(planId, "A", 101)).status, 201);
    }

    // Selecting B after A must deselect A.
    for (const planId of planIds) {
      const response = await http("POST", `/plans/${planId}/select`);
      assert.equal(response.status, 200, JSON.stringify(response.body));
    }

    const first = await http("GET", `/plans/${planIds[0]}`);
    const second = await http("GET", `/plans/${planIds[1]}`);

    assert.equal(first.body.data.status, "GENERATED");
    assert.equal(second.body.data.status, "SELECTED");

    // Both requests should complete without a database error.
    const responses = await Promise.all(
      planIds.map((planId) =>
        http("POST", `/plans/${planId}/select`)
      )
    );

    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
      JSON.stringify(responses)
    );

    const [selectedPlans] = await pool.query(
      `SELECT plan_id
       FROM plan
       WHERE request_id = ? AND status = 'SELECTED'`,
      [selectionRequestId]
    );

    assert.equal(selectedPlans.length, 1);
    assert.ok(planIds.includes(selectedPlans[0].plan_id));
  });

  await t.test("invalid IDs/body and missing resources return client errors", async () => {
    assert.equal((await http("GET", "/plans/nope")).status, 400);
    assert.equal((await http("GET", "/plans/2147483647")).status, 404);
    assert.equal((await http("GET", "/planning-requests/2147483647")).status, 404);
    const planId = await newPlan();
    assert.equal((await http("PUT", `/plans/${planId}/indexes/${codes.A}`, {})).status, 400);
    assert.equal((await http("POST", `/plans/${planId}/clash-check`, {})).status, 400);
    assert.equal((await rows(planId)).length, 0);
  });
});
