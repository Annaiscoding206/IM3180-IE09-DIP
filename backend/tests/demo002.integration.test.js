const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { once } = require('node:events');
const definition = require('../../database/demo002_profile.json');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

test('local demo identity is server-selected, allowlisted and defaults to DEMO001', async t => {
  t.mock.method(require('../src/config/db'), 'query', async (sql, [id]) => [[{ student_id: id }]]);
  const { planningIdentity, optionalPlanningIdentity } = require('../src/middleware/planningIdentity');
  const keys = ['NODE_ENV', 'DEMO_PLANNING_ENABLED', 'DEMO_PLANNING_STUDENT_ID'];
  const saved = keys.map(k => process.env[k]);
  const run = async (middleware, { address = '127.0.0.1', origin, trusted } = {}) => {
    const res = { locals: { authenticatedStudentId: trusted }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await middleware({ socket: { remoteAddress: address }, headers: { origin, 'x-student-id': 'DEMO002' }, query: { student_id: 'DEMO002' } }, res, () => { res.next = true; });
    return res;
  };
  try {
    process.env.NODE_ENV = 'test'; process.env.DEMO_PLANNING_ENABLED = 'true';
    delete process.env.DEMO_PLANNING_STUDENT_ID;
    assert.equal((await run(planningIdentity)).locals.authenticatedStudentId, 'DEMO001');
    process.env.DEMO_PLANNING_STUDENT_ID = 'DEMO002';
    for (const middleware of [planningIdentity, optionalPlanningIdentity]) assert.equal((await run(middleware)).locals.authenticatedStudentId, 'DEMO002');
    assert.equal((await run(planningIdentity, { trusted: 'TRUSTED' })).locals.authenticatedStudentId, 'TRUSTED');
    assert.equal((await run(planningIdentity, { address: '192.0.2.1' })).statusCode, 401);
    assert.equal((await run(planningIdentity, { origin: 'https://untrusted.example' })).statusCode, 403);
    process.env.DEMO_PLANNING_STUDENT_ID = 'VICTIM';
    assert.equal((await run(planningIdentity)).statusCode, 503);
    process.env.NODE_ENV = 'production';
    assert.equal((await run(planningIdentity)).statusCode, 401);
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});

test('EEE demo setup, profile APIs and independent progress over MySQL', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  assert.equal(process.env.DB_NAME, 'stars_companion_db');
  const pool = require('../src/config/db');
  const { setupDemo002 } = require('../scripts/setupDemo002.cjs');
  const { seedDemoCurriculum } = require('../scripts/setupCurriculum.cjs');
  const audit = require('../src/services/degreeAuditService');
  const curriculum = require('../src/services/curriculumService');
  const { matchCurriculum } = require('../src/services/curriculumRulesService');
  const prefix = 'D2' + randomBytes(4).toString('hex').toUpperCase();
  const seed = structuredClone(definition);
  seed.student_id = seed.student.student_id = prefix + 'S';
  seed.student.programme = seed.curriculum.programme = prefix + 'EEE';
  seed.curriculum.curriculum_key = prefix + 'EEE';
  const first = structuredClone(require('../../database/11_programme_curriculum_demo_data.json'));
  first.student_id = prefix + 'I'; first.curriculum.programme = prefix + 'IEM'; first.curriculum.curriculum_key = prefix + 'IEM';
  let server;
  const snapshot = async () => {
    const [tables] = await pool.query('SHOW TABLES'), result = {};
    for (const row of tables) {
      const table = Object.values(row)[0];
      const [rows] = await pool.query('SELECT * FROM `' + table + '`');
      result[table] = createHash('sha256').update(JSON.stringify(rows.map(r => JSON.stringify(r)).sort())).digest('hex');
    }
    return result;
  };
  const originalDatabase = await snapshot();
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query('DELETE FROM student WHERE student_id IN (?, ?, ?)', [seed.student_id, first.student_id, prefix + 'FAIL']);
      await pool.query('DELETE FROM programme_curriculum WHERE curriculum_key IN (?, ?, ?)', [seed.curriculum.curriculum_key, first.curriculum.curriculum_key, prefix + 'FAIL']);
      assert.deepEqual(await snapshot(), originalDatabase, 'All original rows, including DEMO001, planning and catalogue data survive the test');
    } finally { await pool.end(); }
  });
  await pool.query('INSERT INTO student (student_id, student_name, programme, study_year, admission_year, admission_route) VALUES (?, ?, ?, 3, 2024, ?)',
    [first.student_id, 'Isolated IEM fixture', first.curriculum.programme, 'DIRECT_ENTRY']);
  await seedDemoCurriculum(pool, first);
  const firstAttempts = structuredClone(require('../../database/09_degree_audit_demo_data.json').records);
  for (const code of ['IE2108', 'IE2110', 'MH1810']) firstAttempts.push({ source_key: 'demo:legacy:' + code, course_code: code, course_title: null, academic_year: null, semester: null, result: 'PASSED', grade: null, earned_au: 3 });
  await audit.importDemoRecords(first.student_id, firstAttempts);
  const firstBefore = await curriculum.getStudentCurriculum(first.student_id, first.student_id);
  const created = await setupDemo002(pool, seed);
  assert.equal(created.created_student, true);
  assert.equal(created.academic.changed_records, 12);

  let identity = seed.student_id;
  const app = require('express')();
  app.use((req, res, next) => { res.locals.authenticatedStudentId = identity; next(); });
  app.use('/api/students', require('../src/routes/studentRoutes'));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const get = async (suffix, id = identity) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/students/${id}${suffix}`, { signal: AbortSignal.timeout(10000) });
    return { status: res.status, ...await res.json() };
  };
  await t.test('deterministic cohort/route matching does not collide with IEM', async () => {
    assert.equal((await matchCurriculum(seed.student, pool)).curriculum_key, seed.curriculum.curriculum_key);
    for (const changes of [{ admission_year: 2024 }, { admission_route: 'DIRECT_ENTRY' }, { programme: first.curriculum.programme }]) {
      assert.equal(await matchCurriculum({ ...seed.student, ...changes }, pool), null);
    }
    assert.equal((await get('/curriculum')).data.curriculum.curriculum_key, seed.curriculum.curriculum_key);
    assert.equal((await get('', first.student_id)).status, 404, 'Other student cannot be accessed');
    identity = first.student_id;
    assert.equal((await get('/curriculum')).data.curriculum.curriculum_key, first.curriculum.curriculum_key);
    assert.equal((await get('/degree-audit')).data.earned_au, 16);
    identity = seed.student_id;
  });
  await t.test('12 passed attempts earn 28 AU; 25 named requirements and generic BDE are safe without offerings', async () => {
    const response = (await get('/degree-audit')).data;
    assert.equal(response.records.length, 12);
    assert.equal(response.summary.passed_course_count, 12);
    assert.equal(response.summary.earned_au, 28);
    assert.equal(response.summary.earned_au_complete, true);
    assert.ok(response.records.every(r => r.grade === null && r.result === 'PASSED' && r.academic_year === '2025-2026'));
    assert.equal(response.records.filter(r => r.semester === 1).length, 6);
    assert.equal(response.records.filter(r => r.semester === 2).length, 6);
    const profile = await get(''); assert.equal(profile.status, 200);
    assert.equal(profile.data.admission_route, 'NORMAL_ENTRY'); assert.equal(profile.data.study_year, 2);
    const progress = (await get('/curriculum/progress')).data;
    assert.equal(progress.courses.length, 25);
    assert.equal(progress.summary.completed_au, 28);
    assert.equal(progress.summary.required_au, 71);
    assert.equal(progress.summary.remaining_au, 43);
    assert.equal(progress.categories.find(c => c.category_code === 'BDE').requirements_satisfied, false);
    const passed = new Set(seed.records.map(r => r.course_code));
    for (const row of progress.courses) assert.equal(row.status, passed.has(row.course_code) ? 'COMPLETED' : 'NOT_YET_TAKEN');
    const [catalogue] = await pool.query('SELECT DISTINCT course_code FROM course_info');
    const known = new Set(catalogue.map(c => c.course_code));
    const absent = progress.courses.filter(c => !known.has(c.course_code));
    assert.ok(absent.length > 0);
    for (const row of absent) {
      assert.equal(row.eligibility.code, 'COURSE_NOT_IN_CATALOGUE');
      assert.equal(row.eligible, null); assert.equal(row.can_select, false);
    }
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM completed_course WHERE student_id = ?', [seed.student_id]);
    assert.equal(count, 0);
  });
  await t.test('eligibility depends on completion/prerequisites, not demo identity', async () => {
    const eee = await get('/eligibility/IE2110');
    assert.equal(eee.status, 200); assert.equal(eee.already_completed, false); assert.equal(eee.prerequisite_eligible, true);
    identity = first.student_id;
    const iem = await get('/eligibility/IE2110');
    assert.equal(iem.already_completed, true); assert.equal(iem.can_select, false);
    identity = seed.student_id;
  });
  await t.test('plan-specific selections affect status without changing academic history; reruns preserve every table', async () => {
    const [request] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [seed.student_id]);
    const [plan] = await pool.query("INSERT INTO plan (request_id, plan_name) VALUES (?, 'Preserve EEE plan')", [request.insertId]);
    await pool.query('INSERT INTO plan_selected_course (plan_id, course_code) VALUES (?, ?)', [plan.insertId, 'IE2110']);
    const selected = (await get('/curriculum?plan_id=' + plan.insertId)).data;
    assert.equal(selected.courses.find(c => c.course_code === 'IE2110').status, 'PLANNED');
    assert.equal(selected.summary.completed_au, 28);
    const before = await snapshot();
    const again = await setupDemo002(pool, seed);
    assert.equal(again.created_student, false); assert.equal(again.curriculum.changed_rows, 0); assert.equal(again.academic.changed_records, 0);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await curriculum.getStudentCurriculum(first.student_id, first.student_id), firstBefore);
  });
  await t.test('conflicting history is rejected without resetting user data', async () => {
    await pool.query("UPDATE academic_record SET grade = 'A' WHERE student_id = ? AND course_code = 'MH1810'", [seed.student_id]);
    const before = await snapshot();
    await assert.rejects(setupDemo002(pool, seed), /Existing academic history differs/);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('late curriculum failure rolls back new identity and partial curriculum writes', async () => {
    const broken = structuredClone(seed);
    broken.student_id = broken.student.student_id = prefix + 'FAIL';
    broken.student.programme = broken.curriculum.programme = prefix + 'FAIL';
    broken.curriculum.curriculum_key = prefix + 'FAIL';
    delete broken.courses[24].is_required;
    const before = await snapshot();
    await assert.rejects(setupDemo002(pool, broken), /Invalid curriculum_course seed fields/);
    assert.deepEqual(await snapshot(), before);
  });
});
