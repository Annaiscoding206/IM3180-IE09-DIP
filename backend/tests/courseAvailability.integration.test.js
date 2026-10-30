const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');

test('full catalogue availability and term enforcement across selection and generation', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  assert.equal(process.env.DB_NAME, 'stars_companion_db');
  const pool = require('../src/config/db');
  const prefix = 'AV' + randomBytes(3).toString('hex').toUpperCase();
  const student = prefix + 'S', foreign = prefix + 'F';
  const codes = [prefix + 'A', prefix + 'B', prefix + 'C'];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query('DELETE FROM student WHERE student_id IN (?, ?)', [student, foreign]);
      await pool.query('DELETE FROM course_info WHERE course_code IN (?)', [codes]);
    } finally { await pool.end(); }
  });
  for (const id of [student, foreign]) await pool.query("INSERT INTO student (student_id, programme, study_year) VALUES (?, 'TEST', 2)", [id]);
  for (const [code, index, semester, day] of [[codes[0], 101, 1, 'MON'], [codes[1], 201, 2, 'MON'], [codes[2], 301, 1, 'TUE'], [codes[2], 302, 2, 'TUE']]) {
    await pool.query(`INSERT INTO course_info (course_code,index_no,course_name,au,grading_type,academic_year,semester)
      VALUES (?, ?, 'Availability fixture', 3, 'LETTER_GRADED', '2026-2027', ?)`, [code,index,semester]);
    await pool.query(`INSERT INTO class_slots (course_code,index_no,class_type,day_of_week,start_time,end_time,teaching_weeks)
      VALUES (?, ?, 'LECTURE', ?, '09:00', '10:00', '1-13')`, [code,index,day]);
  }
  const contexts = [];
  for (const [owner, year, semester] of [[student,'2026-2027',1], [student,'2026-2027',2], [student,'2025-2026',1], [foreign,'2026-2027',1]]) {
    const [r] = await pool.query('INSERT INTO planning_request (student_id,academic_year,semester) VALUES (?, ?, ?)', [owner,year,semester]);
    const [p] = await pool.query("INSERT INTO plan (request_id,plan_name) VALUES (?, 'Availability fixture')", [r.insertId]);
    contexts.push({ request_id: r.insertId, plan_id: p.insertId, academic_year: year, semester });
  }
  const app = require('express')(); app.use(require('express').json());
  app.use((req,res,next) => { res.locals.authenticatedStudentId = student; next(); });
  app.use('/api/courses', require('../src/routes/courseRoutes'));
  app.use('/api/plans', require('../src/routes/planRoutes'));
  app.use('/api/planning-requests', require('../src/routes/planningRequestRoutes'));
  app.use('/api/students', require('../src/routes/studentRoutes'));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const http = async (path, method = 'GET', body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method,
      headers: {'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}) });
    return {status:res.status, body:await res.json()};
  };
  const list = query => http(`/courses?search=${prefix}${query}`);

  await t.test('unfiltered catalogue includes all three courses once; offering terms remain explicit', async () => {
    const result = await list(''); assert.equal(result.status,200);
    assert.deepEqual(result.body.data.map(c => c.course_code), codes);
    assert.ok(result.body.data.every(c => c.available_for_planning_term === null && c.planning_term === null));
    assert.deepEqual(result.body.data[2].available_semesters, [{academic_year:'2026-2027',semester:1},{academic_year:'2026-2027',semester:2}]);
    assert.equal((await list('&semester=1&academic_year=2026-2027')).body.count,2, 'Explicit API filters remain supported');
  });
  await t.test('plan and request-only contexts annotate availability without changing academic eligibility', async () => {
    for (const [n, flags] of [[0,[true,false,true]],[1,[false,true,true]],[2,[false,false,false]]]) {
      const context = contexts[n];
      for (const query of [`&plan_id=${context.plan_id}`, `&planning_request_id=${context.request_id}`]) {
        const result = await list(query); assert.equal(result.status,200);
        assert.deepEqual(result.body.data.map(c => c.available_for_planning_term),flags);
        assert.ok(result.body.data.every(c => c.planning_term.academic_year === context.academic_year && c.planning_term.semester === context.semester));
        if (query.includes('planning_request_id')) assert.ok(result.body.data.every(c => c.planning_context.scope === 'ACADEMIC_ONLY'));
      }
      const eligibility = await http(`/students/${student}/eligibility/${codes[1]}?plan_id=${context.plan_id}`);
      assert.equal(eligibility.status,200); assert.equal(eligibility.body.can_select,true);
      assert.equal(eligibility.body.eligible,true);
      const detail = await http(`/courses/${codes[2]}?plan_id=${context.plan_id}`);
      assert.equal(detail.status,200); assert.equal(detail.body.data.indexes.length,2);
      assert.deepEqual(detail.body.data.indexes.map(i=>i.semester),[1,2]);
      if(n<2) assert.equal(detail.body.data.semester,context.semester, 'Prefer matching-term metadata');
    }
  });
  await t.test('foreign, mismatched and invalid planning contexts are rejected; request_id retains its old contract', async () => {
    assert.equal((await list(`&planning_request_id=${contexts[3].request_id}`)).status,404);
    assert.equal((await list(`&plan_id=${contexts[3].plan_id}`)).status,404);
    assert.equal((await list(`&plan_id=${contexts[0].plan_id}&planning_request_id=${contexts[1].request_id}`)).status,404);
    assert.equal((await list('&planning_request_id=bad')).status,400);
    assert.equal((await list(`&request_id=${contexts[0].request_id}`)).body.code,'PLAN_ID_REQUIRED');
  });
  await t.test('both manual selection APIs reject unavailable courses without writing selections', async () => {
    for (const context of [contexts[0],contexts[2]]) {
      for (const route of [`/plans/${context.plan_id}/selected-courses`, `/plans/${context.request_id}/courses`]) {
        const result = await http(route,'POST',{course_code:codes[1]});
        assert.equal(result.status,422); assert.equal(result.body.code,'COURSE_NOT_AVAILABLE_IN_TERM');
        assert.equal(result.body.academic_year,context.academic_year); assert.equal(result.body.semester,context.semester);
      }
      assert.equal((await pool.query('SELECT * FROM plan_selected_course WHERE plan_id = ?',[context.plan_id]))[0].length,0);
      assert.equal((await pool.query('SELECT * FROM planning_request_course WHERE request_id = ?',[context.request_id]))[0].length,0);
    }
  });
  await t.test('single-term and dual-term courses can be selected in matching plans; wrong-term indexes are rejected', async () => {
    for (const [n, code] of [[0,codes[0]],[1,codes[1]]]) {
      const context=contexts[n];
      for(const c of [code,codes[2]]) assert.equal((await http(`/plans/${context.plan_id}/selected-courses`,'POST',{course_code:c})).status,201);
      const wrong = await http(`/plans/${context.plan_id}/indexes/${codes[2]}`,'PUT',{index_no:n===0?302:301});
      assert.equal(wrong.status,422);
      assert.match(wrong.body.message,/academic year and semester/);
      assert.equal((await http(`/plans/${context.plan_id}/indexes/${codes[2]}`,'PUT',{index_no:n===0?301:302})).status,201);
    }
  });
  await t.test('generation reuses matching-term index filtering for both semesters', async () => {
    for(const n of [0,1]) {
      const context=contexts[n];
      const result=await http(`/planning-requests/${context.request_id}/generate-plans`,'POST',{source_plan_id:context.plan_id});
      assert.equal(result.status,201,JSON.stringify(result.body));
      assert.ok(result.body.data.plans.length>0);
      for(const plan of result.body.data.plans) assert.deepEqual(plan.indexes.map(i=>i.index_no).sort((a,b)=>a-b),n===0?[101,301]:[201,302]);
    }
  });
});
