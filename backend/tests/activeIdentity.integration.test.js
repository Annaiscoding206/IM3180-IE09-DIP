const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

test('planning and chat fail closed for invalid, absent or unavailable configured students', async t => {
  const pool = require('../src/config/db');
  const { planningIdentity, optionalPlanningIdentity, resolveDemoStudentId } = require('../src/middleware/planningIdentity');
  const { localDemoChatIdentity } = require('../src/middleware/localDemoChatIdentity');
  const keys = ['NODE_ENV', 'DEMO_PLANNING_ENABLED', 'DEMO_CHAT_ENABLED', 'DEMO_PLANNING_STUDENT_ID'];
  const saved = keys.map(k => process.env[k]);
  t.after(() => keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }));
  process.env.NODE_ENV = 'test'; process.env.DEMO_PLANNING_ENABLED = process.env.DEMO_CHAT_ENABLED = 'true';
  let exists = false, unavailable = false;
  t.mock.method(pool, 'query', async (sql, [id]) => {
    if (unavailable) throw new Error('Database unavailable');
    return exists ? [[{ student_id: id }]] : [[]];
  });
  for (const id of ['', ' DEMO002 ', 'VICTIM', 'demo002', 'DEMO002']) {
    process.env.DEMO_PLANNING_STUDENT_ID = id;
    await assert.rejects(resolveDemoStudentId());
    for (const middleware of [planningIdentity, optionalPlanningIdentity, localDemoChatIdentity]) {
      const res = { locals: {}, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
      await middleware({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res, () => assert.fail('Must not become another or anonymous student'));
      assert.equal(res.code, 503); assert.equal(res.body.code, 'DEMO_IDENTITY_UNAVAILABLE');
      assert.equal(res.locals.authenticatedStudentId, undefined);
    }
  }
  exists = true;
  assert.equal(await resolveDemoStudentId(), 'DEMO002');
  delete process.env.DEMO_PLANNING_STUDENT_ID;
  assert.equal(await resolveDemoStudentId(), 'DEMO001');
  unavailable = true;
  const res = { locals: {}, status(n) { this.code = n; return this; }, json() { return this; } };
  await planningIdentity({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res, () => assert.fail('No fallback during outage'));
  assert.equal(res.code, 503);
});

test('both active demo modes isolate bootstrap, profile, catalogue, Planner and shared Leo history', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  assert.equal(process.env.DB_NAME, 'stars_companion_db');
  const pool = require('../src/config/db');
  const keys = ['NODE_ENV', 'DEMO_PLANNING_ENABLED', 'DEMO_CHAT_ENABLED', 'DEMO_PLANNING_STUDENT_ID', 'OPENAI_AGENTS_DISABLE_TRACING'];
  const saved = keys.map(k => process.env[k]);
  process.env.NODE_ENV = 'test'; process.env.DEMO_PLANNING_ENABLED = process.env.DEMO_CHAT_ENABLED = 'true';
  process.env.OPENAI_AGENTS_DISABLE_TRACING = '1';
  const conversations = await import('../src/services/conversationService.mjs');
  const { askSmartStars } = await import('../src/services/chatService.mjs');
  const { getAcademicContextTool } = await import('../src/ai/tools/planningTools.mjs');
  const leo = require('../src/services/leoPlanningService');
  const snapshot = async () => {
    const [tables] = await pool.query('SHOW TABLES'), result = {};
    for (const row of tables) {
      const name = Object.values(row)[0], [rows] = await pool.query('SELECT * FROM `' + name + '`');
      result[name] = createHash('sha256').update(JSON.stringify(rows.map(r => JSON.stringify(r)).sort())).digest('hex');
    }
    return result;
  };
  const before = await snapshot();
  const [previousActive] = await pool.query("SELECT * FROM ai_active_conversation WHERE student_id IN ('DEMO001', 'DEMO002')");
  const fixtures = {}, createdConversations = [], createdRequests = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      if (createdConversations.length) await pool.query('DELETE FROM ai_conversation WHERE conversation_id IN (?)', [createdConversations]);
      // Restore exactly the original active-pointer rows, including timestamps.
      for (const row of previousActive) {
        const fields = Object.keys(row);
        await pool.query(`INSERT INTO ai_active_conversation (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${fields.map(k => `${k} = ?`).join(',')}`, [...Object.values(row), ...Object.values(row)]);
      }
      if (createdRequests.length) await pool.query('DELETE FROM planning_request WHERE request_id IN (?)', [createdRequests]);
      assert.deepEqual(await snapshot(), before, 'All existing academic, curriculum, catalogue, planning and chat rows remain unchanged');
    } finally {
      keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
      await pool.end();
    }
  });
  for (const [id, selected] of [['DEMO001', 'IE3102'], ['DEMO002', 'IE2110']]) {
    const [request] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [id]);
    createdRequests.push(request.insertId);
    const [plan] = await pool.query("INSERT INTO plan (request_id, plan_name) VALUES (?, 'Identity regression fixture')", [request.insertId]);
    await pool.query('INSERT INTO plan_selected_course (plan_id, course_code) VALUES (?, ?)', [plan.insertId, selected]);
    const conversation = await conversations.createConversation({ studentId: id, title: 'Identity regression fixture' });
    createdConversations.push(conversation.conversation_id);
    await conversations.saveMessage({ studentId: id, conversationId: conversation.conversation_id, role: 'user', content: id + ' private Telegram marker', sourceChannel: 'telegram' });
    await conversations.setActiveConversationId({ studentId: id, conversationId: conversation.conversation_id });
    fixtures[id] = { request: request.insertId, plan: plan.insertId, conversation: conversation.conversation_id, selected };
  }
  const app = require('express')(); app.use(require('express').json());
  app.use('/api/students', require('../src/routes/studentRoutes'));
  app.use('/api/courses', require('../src/routes/courseRoutes'));
  app.use('/api/plans', require('../src/routes/planRoutes'));
  app.use('/api/planning-requests', require('../src/routes/planningRequestRoutes'));
  app.use('/api/chat', require('../src/middleware/localDemoChatIdentity').localDemoChatIdentity, require('../src/routes/chatRoutes'));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const http = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-student-id': 'VICTIM' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    return { status: response.status, ...await response.json() };
  };
  for (const id of ['DEMO001', 'DEMO002']) await t.test(id + ' uses one identity across all routes and Leo', async () => {
    process.env.DEMO_PLANNING_STUDENT_ID = id;
    const own = fixtures[id], otherId = id === 'DEMO001' ? 'DEMO002' : 'DEMO001', foreign = fixtures[otherId];
    const expected = id === 'DEMO001' ? { programme: 'IEM', au: 16, passed: 5, key: 'DEMO_IEM_2024_DIRECT_V1' } : { programme: 'EEE', au: 28, passed: 12, key: 'DEMO_EEE_2025_NORMAL_V1' };
    assert.equal((await http('/students/current?student_id=' + otherId)).data.student_id, id);
    const profile = await http('/students/' + id); assert.equal(profile.status, 200); assert.equal(profile.data.programme, expected.programme);
    const audit = (await http('/students/' + id + '/degree-audit')).data;
    assert.equal(audit.summary.passed_course_count, expected.passed); assert.equal(audit.earned_au, expected.au);
    assert.equal((await http('/students/' + id + '/curriculum')).data.curriculum.curriculum_key, expected.key);
    const requests = (await http('/planning-requests?student_id=' + id)).data;
    assert.ok(requests.some(r => r.request_id === own.request)); assert.ok(requests.every(r => r.student_id === id));
    const selected = await http('/plans/' + own.plan + '/selected-courses'); assert.equal(selected.status, 200);
    assert.deepEqual(selected.data.map(r => r.course_code), [own.selected]);
    const courses = await http('/courses?plan_id=' + own.plan); assert.equal(courses.status, 200);
    const signals = courses.data.find(c => c.course_code === 'IE2110');
    assert.equal(signals.curriculum_status, id === 'DEMO001' ? 'COMPLETED' : 'PLANNED');
    for (const route of ['/students/' + otherId, '/planning-requests?student_id=' + otherId, '/plans/' + foreign.plan + '/selected-courses', '/courses?plan_id=' + foreign.plan, '/courses?planning_request_id=' + foreign.request, '/students/' + id + '/curriculum?plan_id=' + foreign.plan]) {
      assert.equal((await http(route)).status, 404, route);
    }
    const context = await leo.getPlanningContext(id, own.request, own.plan);
    assert.equal(context.request.student_id, id); assert.deepEqual(context.selected_courses, [own.selected]);
    await assert.rejects(leo.getPlanningContext(id, foreign.request, foreign.plan), { status: 404 });
    // Inject only the model runner; real Leo context and tools must use the active identity.
    await askSmartStars({ studentId: id, conversationId: own.conversation, message: 'Inspect my academic profile' }, { runAgent: async (agent, input, options) => {
      assert.equal(options.context.studentId, id);
      const academic = JSON.parse(await getAcademicContextTool.invoke({ context: options.context }, JSON.stringify({ section: 'profile', plan_id: null })));
      assert.equal(academic.student_id, id); assert.equal(academic.programme, expected.programme);
      assert.equal(academic.degree_audit_summary.earned_au, expected.au);
      assert.equal(academic.curriculum_progress.curriculum.curriculum_key, expected.key);
      return { finalOutput: id + ' academic profile verified' };
    } });
    // Deterministic path: no model/network call; verifies actual controller and shared active history.
    const reply = await http('/chat', { message: 'What was my last message from Telegram?', studentId: otherId });
    assert.equal(reply.status, 200); assert.equal(reply.conversation_id, own.conversation);
    assert.ok(reply.reply.includes(id + ' private Telegram marker')); assert.ok(!reply.reply.includes(otherId));
    const active = await http('/chat/active'); assert.equal(active.conversation_id, own.conversation);
    assert.ok(active.data.every(m => !m.content.includes(otherId)));
    assert.equal((await http('/chat/conversations/' + foreign.conversation + '/messages')).status, 404);
    assert.equal((await http('/chat', { message: 'What was my last message from Telegram?', conversationId: foreign.conversation })).status, 404);
  });
});
