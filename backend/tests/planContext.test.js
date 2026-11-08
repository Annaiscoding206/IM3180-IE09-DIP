const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlanContext, contextQuery } = require('../src/services/planContextService');

test('academic-only reads do not query or infer selections', async () => {
  const context = await resolvePlanContext('S', {}, { query() { throw Error('Unexpected query'); } });
  assert.equal(context.scope, 'ACADEMIC_ONLY');
  assert.deepEqual(context.selected_course_codes, []);
  assert.equal(context.plan_id, null);
});
test('context rejects missing identity, malformed IDs and request-only scope', async () => {
  await assert.rejects(resolvePlanContext(null), { status: 401 });
  for (const value of [null, 0, -1, 1.2, '01', [], ['1','2'], {}, '2147483648']) {
    assert.throws(() => contextQuery({ plan_id: value }), { status: 400 });
  }
  assert.throws(() => contextQuery({ request_id: '1' }), e => e.status === 400 && e.details.code === 'PLAN_ID_REQUIRED');
});
test('only owned explicit plan supplies selections; request must match; archived rejected', async () => {
  const plan = { plan_id: 2, request_id: 1, plan_status: 'GENERATED', plan_name: 'Plan A' };
  let owner = 'S', selected = ['C1'];
  const db = { async query(sql, params) {
    assert.match(sql, /^SELECT/);
    assert.doesNotMatch(sql, /planning_request_course|plan_course\b/);
    if (sql.includes('FROM plan p')) return [params[1] === owner && params[0] === 2 ? [plan] : []];
    return [selected.map(course_code => ({ course_code }))];
  } };
  const context = await resolvePlanContext('S', { plan_id: '2', request_id: '1' }, db);
  assert.equal(context.scope, 'EXPLICIT_PLAN'); assert.deepEqual(context.selected_course_codes, ['C1']);
  selected = []; assert.deepEqual((await resolvePlanContext('S', { plan_id: 2 }, db)).selected_course_codes, []);
  await assert.rejects(resolvePlanContext('S', { plan_id: 2, request_id: 3 }, db), { status: 404 });
  await assert.rejects(resolvePlanContext('OTHER', { plan_id: 2 }, db), { status: 404 });
  await assert.rejects(resolvePlanContext('S', { plan_id: 99 }, db), { status: 404 });
  plan.plan_status = 'ARCHIVED';
  await assert.rejects(resolvePlanContext('S', { plan_id: 2 }, db), e => e.status === 409 && e.details.code === 'PLAN_ARCHIVED');
});

test('Leo asks for clarification when legacy data has multiple confirmed plans', async t => {
  const summaries = require('../src/services/planningSummaryService');
  const leo = require('../src/services/leoPlanningService');
  const { PlanningError } = require('../src/services/planningError');
  t.mock.method(summaries, 'requireOwnedRequest', async () => ({ request_id: 1 }));
  t.mock.method(summaries, 'getActivePlan', async () => {
    throw new PlanningError(409, 'Multiple active selections', { code: 'AMBIGUOUS_SELECTION' });
  });
  assert.equal((await leo.resolveEligibilityPlan('S', 1)).status, 'clarification_required');
});
