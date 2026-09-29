const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const courseSql = fs.readFileSync(path.join(root, "database/02_course_data.sql"), "utf8");
const demoSql = fs.readFileSync(path.join(root, "database/03_demo_data.sql"), "utf8");
const insertLine = (table) => courseSql.split("\n").find((line) =>
  line.startsWith("INSERT INTO `" + table + "` VALUES")
);

// Read the checked-in seed rows so the DEMO001 regressions use real project
// prerequisites/restrictions. This fixture reader targets the seed's SQL format.
const demoStudent = demoSql.match(/INSERT INTO student[\s\S]*?VALUES\s*\(\s*'([^']+)',\s*'[^']+',\s*'([^']+)'/);
const seeded = {
  students: [{ student_id: demoStudent[1], programme: demoStudent[2] }],
  courses: [...new Set([...insertLine("course_info").matchAll(/\('([^']+)',\d+,'/g)]
    .map((match) => match[1]))].map((course_code) => ({ course_code })),
  completed: [...demoSql.match(/INSERT INTO completed_course[\s\S]*?;/)[0]
    .matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
    .map(([, student_id, course_code]) => ({ student_id, course_code })),
  requirements: [...insertLine("course_requirement")
    .matchAll(/\(\d+,'([^']+)','([^']+)','([^']+)',(\d+)\)/g)]
    .map(([, course_code, required_course_code, requirement_type, group]) => ({
      course_code, required_course_code, requirement_type, requirement_group: Number(group),
    })),
  restrictions: [...insertLine("programme_restriction")
    .matchAll(/\(\d+,'([^']+)','([^']+)',(NULL|'[^']*'),'([^']+)'\)/g)]
    .map(([, course_code, programme, cohort, restriction_type]) => ({
      course_code, programme, cohort: cohort === "NULL" ? null : cohort.slice(1, -1), restriction_type,
    })),
  requests: [{ request_id: "17", student_id: "DEMO001" }],
};
assert.equal(seeded.requirements.length, 19, "Load all seeded requirement rows");
assert.equal(seeded.restrictions.length, 5, "Load all seeded restriction rows");
assert.equal(seeded.completed.length, 3, "Load DEMO001 completed courses");

// Load the actual modules with an isolated database stub, without starting a
// server, connecting to MySQL, or modifying the shared require cache.
function loadModule(relativePath, dependencies) {
  const sandbox = {
    module: { exports: {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: { error() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), "utf8"), sandbox, {
    filename: relativePath,
  });
  return sandbox.module.exports;
}

const same = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();
const plain = (value) => JSON.parse(JSON.stringify(value));
function setup(change = () => {}) {
  const data = structuredClone(seeded);
  change(data);
  const inserts = [];
  const db = {
    async query(sql, params) {
      if (/FROM student\b/.test(sql)) return [data.students.filter((row) => same(row.student_id, params[0]))];
      if (/FROM course_info\b/.test(sql)) return [data.courses.filter((row) => same(row.course_code, params[0]))];
      if (/FROM course_requirement\b/.test(sql)) {
        assert.match(sql, /requirement_type = 'PREREQUISITE'/);
        assert.match(sql, /SELECT required_course_code, requirement_group/);
        return [data.requirements.filter((row) => same(row.course_code, params[0]) && row.requirement_type === "PREREQUISITE")];
      }
      if (/FROM completed_course\b/.test(sql)) return [data.completed.filter((row) => same(row.student_id, params[0]))];
      if (/FROM programme_restriction\b/.test(sql)) {
        assert.equal(params.length, 1, "Read every programme rule, not just matching allowlist entries");
        return [data.restrictions.filter((row) => same(row.course_code, params[0]))];
      }
      if (/FROM planning_request\b/.test(sql)) {
        assert.match(sql, /SELECT request_id, student_id/);
        return [data.requests.filter((row) => same(row.request_id, params[0]))];
      }
      if (/INSERT INTO planning_request_course/.test(sql)) {
        inserts.push(plain(params));
        return [{ affectedRows: 1 }];
      }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
  };
  const service = loadModule("backend/src/services/eligibilityService.js", { "../config/db": db });
  const planService = loadModule("backend/src/services/planService.js", {
    "../config/db": db, "./eligibilityService": service,
    "./clashService": require("../src/services/clashService"),
  });
  const dependencies = { "../config/db": db, "../services/eligibilityService": service, "../services/planService": planService };
  const student = loadModule("backend/src/controllers/studentController.js", dependencies);
  const plan = loadModule("backend/src/controllers/planController.js", dependencies);
  async function invoke(handler, req) {
    const response = { statusCode: 200, body: null };
    await handler(req, {
      status(code) { response.statusCode = code; return this; },
      json(body) { response.body = plain(body); return this; },
    });
    return response;
  }
  return {
    data, db, inserts,
    check: (courseCode, studentId = "DEMO001") =>
      invoke(student.checkPrerequisiteEligibility, { params: { studentId, courseCode } }),
    add: (course_code, requestId = "17", extraBody = {}) =>
      invoke(plan.addSelectedCourse, { params: { requestId }, body: { course_code, ...extraBody } }),
  };
}

const rule = (restriction_type, programme, cohort = null) => ({
  course_code: "MH1810", restriction_type, programme, cohort,
});

test("DEMO001 satisfies IE3014 through IE2110", async () => {
  const { statusCode, body } = await setup().check("IE3014");
  assert.equal(statusCode, 200);
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.eligible, true);
  assert.deepEqual(body.missing_prerequisite_groups, []);
  assert.deepEqual(body.missing_prerequisites, []);
});

test("DEMO001 satisfies SC5002 prerequisites but is rejected for IEM", async () => {
  const { body } = await setup().check("SC5002");
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.programme_eligible, false);
  assert.equal(body.eligible, false);
  assert.match(body.message, /not available to your programme/);
});

test("no prerequisites is prerequisite eligible", async () => {
  const { body } = await setup().check("MH1810");
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.eligible, true);
});

test("no prerequisites does not bypass programme restrictions", async () => {
  const app = setup((data) => data.students[0].programme = "ADMC");
  const { body } = await app.check("DA1000");
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.programme_eligible, false);
  assert.equal(body.eligible, false);
});

test("unknown student returns 404 even for a course without prerequisites", async () => {
  const response = await setup().check("MH1810", "UNKNOWN");
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Student not found");
});

test("unknown course returns 404", async () => {
  const response = await setup().check("UNKNOWN");
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Course not found");
});

test("POST rejects programme-ineligible selection without inserting", async () => {
  const app = setup();
  const response = await app.add("SC5002", "17", { student_id: "OTHER_STUDENT" });
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.student_id, "DEMO001");
  assert.equal(response.body.programme_eligible, false);
  assert.deepEqual(app.inserts, []);
});

test("POST rejects missing prerequisites without inserting", async () => {
  const app = setup();
  const response = await app.add("DA2002");
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.prerequisite_eligible, false);
  assert.deepEqual(app.inserts, []);
});

test("POST accepts an eligible course under request_id", async () => {
  const app = setup();
  const response = await app.add("IE3014");
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { success: true, message: "Course added successfully" });
  assert.deepEqual(app.inserts, [["17", "IE3014"]]);
});

test("POST unknown request, student, or course returns 404 without inserting", async () => {
  for (const [change, code, request, message] of [
    [() => {}, "IE3014", "999", "Planning request not found"],
    [(data) => data.students = [], "IE3014", "17", "Student not found"],
    [() => {}, "UNKNOWN", "17", "Course not found"],
  ]) {
    const app = setup(change);
    const response = await app.add(code, request);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.message, message);
    assert.deepEqual(app.inserts, []);
  }
});

test("one OR option per group satisfies multiple AND groups", async () => {
  const app = setup((data) => {
    data.courses.push({ course_code: "GROUPED" });
    data.requirements.push(...[
      [1, "OPTION_A"], [1, "IE2110"], [2, "MH1810"], [2, "OPTION_D"],
    ].map(([requirement_group, required_course_code]) => ({
      course_code: "GROUPED", requirement_type: "PREREQUISITE", requirement_group, required_course_code,
    })));
  });
  assert.equal((await app.check("GROUPED")).body.eligible, true);
  app.data.completed = app.data.completed.filter((row) => row.course_code !== "MH1810");
  const { body } = await app.check("GROUPED");
  assert.equal(body.eligible, false);
  assert.deepEqual(body.missing_prerequisite_groups, [
    { requirement_group: 2, alternatives: ["MH1810", "OPTION_D"] },
  ]);
  assert.deepEqual(body.missing_prerequisites, ["MH1810", "OPTION_D"]);
});

test("ONLY_AVAILABLE allows any listed programme and rejects others", async () => {
  const app = setup((data) => data.restrictions = [rule("ONLY_AVAILABLE", "EEE"), rule("ONLY_AVAILABLE", "IEM")]);
  assert.equal((await app.check("MH1810")).body.eligible, true);
  app.data.students[0].programme = "ADMC";
  const { body } = await app.check("MH1810");
  assert.equal(body.programme_eligible, false);
  assert.match(body.message, /only available to other programmes/);
  assert.equal((await app.add("MH1810")).statusCode, 422);
  assert.deepEqual(app.inserts, []);
});

test("matching NOT_AVAILABLE takes precedence over ONLY_AVAILABLE", async () => {
  const app = setup((data) => data.restrictions = [rule("ONLY_AVAILABLE", "IEM"), rule("NOT_AVAILABLE", "IEM")]);
  assert.equal((await app.check("MH1810")).body.programme_eligible, false);
});

test("seeded IE4758 cohort rule is unknown and POST is blocked, not guessed", async () => {
  const app = setup((data) => data.completed.push({ student_id: "DEMO001", course_code: "IE1005" }));
  const { body } = await app.check("IE4758");
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.programme_eligible, null);
  assert.equal(body.eligible, false);
  assert.equal(body.requires_review, true);
  assert.equal(body.unresolved_restrictions[0].cohort, "2019-2021 Direct Entry");
  assert.match(body.message, /cohort data is unavailable/);
  assert.equal((await app.add("IE4758")).statusCode, 422);
  assert.deepEqual(app.inserts, []);
});

test("cohort NOT_AVAILABLE for another programme does not block", async () => {
  const app = setup((data) => data.restrictions = [rule("NOT_AVAILABLE", "EEE", "2020")]);
  const { body } = await app.check("MH1810");
  assert.equal(body.eligible, true);
  assert.deepEqual(body.unresolved_restrictions, []);
});

test("cohort ONLY_AVAILABLE cannot be assumed to allow or exclude the student", async () => {
  for (const programme of ["IEM", "EEE"]) {
    const app = setup((data) => data.restrictions = [rule("ONLY_AVAILABLE", programme, "2020")]);
    const { body } = await app.check("MH1810");
    assert.equal(body.programme_eligible, null);
    assert.equal(body.requires_review, true);
    assert.equal(body.eligible, false);
  }
});

test("definite general denial remains false despite cohort uncertainty", async () => {
  const app = setup((data) => data.restrictions = [rule("NOT_AVAILABLE", "IEM"), rule("ONLY_AVAILABLE", "IEM", "2020")]);
  const { body } = await app.check("MH1810");
  assert.equal(body.programme_eligible, false);
  assert.equal(body.eligible, false);
});

test("code comparisons tolerate casing differences", async () => {
  const app = setup((data) => {
    data.students[0].programme = "iem";
    data.completed.forEach((row) => row.course_code = row.course_code.toLowerCase());
  });
  const { body } = await app.check("sc5002");
  assert.equal(body.prerequisite_eligible, true);
  assert.equal(body.programme_eligible, false);
});

test("corequisites are not silently treated as prerequisites", async () => {
  const app = setup((data) => data.completed = []);
  assert.equal((await app.check("MH1811")).body.prerequisite_eligible, true);
});

test("database failure returns 500 and does not insert", async () => {
  const app = setup();
  const originalQuery = app.db.query;
  app.db.query = async (sql, params) => {
    if (/FROM programme_restriction/.test(sql)) throw new Error("Database unavailable");
    return originalQuery(sql, params);
  };
  assert.equal((await app.check("MH1810")).statusCode, 500);
  assert.equal((await app.add("MH1810")).statusCode, 500);
  assert.deepEqual(app.inserts, []);
});
