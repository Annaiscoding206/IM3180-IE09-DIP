const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('local demo switch is allowlisted, validates existence and fails safely without database writes', async t => {
  const keys = ['DEMO_PLANNING_ENABLED', 'DEMO_PLANNING_STUDENT_ID', 'NODE_ENV'];
  const saved = keys.map(k => process.env[k]);
  process.env.DEMO_PLANNING_ENABLED = 'true';
  process.env.DEMO_PLANNING_STUDENT_ID = 'DEMO001';
  process.env.NODE_ENV = 'test';
  t.after(() => keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }));
  const pool = require('../src/config/db');
  const existing = new Set(['DEMO001', 'DEMO002']);
  let unavailable = null, trusted = false;
  t.mock.method(pool, 'query', async (sql, [id]) => {
    assert.match(sql, /^SELECT student_id FROM student WHERE student_id = \?$/);
    if (id === unavailable) throw new Error('Private database failure');
    return [existing.has(id) ? [{ student_id: id }] : []];
  });
  const app = require('express')(); app.use(require('express').json());
  app.use((req, res, next) => { if (trusted) res.locals.authenticatedStudentId = 'DEMO001'; next(); });
  app.use('/api/students', require('../src/routes/studentRoutes'));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (body, origin = 'http://localhost:5173') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/students/current`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, ...await response.json() };
  };
  assert.deepEqual((await request()).data, { student_id: 'DEMO001', demo_switch_enabled: true });
  for (const id of ['DEMO002', 'DEMO001']) {
    assert.equal((await request({ student_id: id })).data.student_id, id);
    assert.equal((await request()).data.student_id, id);
    assert.equal(process.env.DEMO_PLANNING_STUDENT_ID, 'DEMO001', 'Switch does not edit environment');
  }
  for (const id of ['VICTIM', '', 'demo002', ' DEMO002 ', null, 2, ['DEMO002'], { id: 'DEMO002' }]) {
    const rejected = await request({ student_id: id });
    assert.equal(rejected.status, 400); assert.equal(rejected.code, 'INVALID_DEMO_STUDENT');
    assert.equal((await request()).data.student_id, 'DEMO001');
  }
  assert.equal((await request({})).status, 400);
  existing.delete('DEMO002');
  const missing = await request({ student_id: 'DEMO002' });
  assert.equal(missing.status, 404); assert.equal(missing.code, 'DEMO_STUDENT_NOT_FOUND');
  assert.equal((await request()).data.student_id, 'DEMO001');
  existing.add('DEMO002'); unavailable = 'DEMO002';
  const failure = await request({ student_id: 'DEMO002' });
  assert.equal(failure.status, 503); assert.ok(!failure.message.includes('Private'));
  assert.equal((await request()).data.student_id, 'DEMO001'); unavailable = null;
  assert.equal((await request({ student_id: 'DEMO002' }, 'https://foreign.example')).status, 403);
  process.env.DEMO_PLANNING_ENABLED = 'false';
  assert.equal((await request({ student_id: 'DEMO002' })).status, 401);
  trusted = true;
  assert.equal((await request()).data.demo_switch_enabled, false);
  assert.equal((await request({ student_id: 'DEMO002' })).status, 403);
  process.env.DEMO_PLANNING_ENABLED = 'true';
  assert.equal((await request({ student_id: 'DEMO002' })).status, 403, 'Trusted auth is not demo impersonation permission');
  trusted = false; process.env.NODE_ENV = 'production';
  assert.equal((await request({ student_id: 'DEMO002' })).status, 401);
});
