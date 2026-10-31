import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';

let loadApp, dom, root;
before(async () => { loadApp = await compileModule('main.jsx'); });
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173' });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; dom.window.close(); });
const flush = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); });
const mount = async () => { await act(async () => { root = (await loadApp()).appRoot; }); await flush(); };
const wait = async condition => { for (let i = 0; i < 50; i++) { if (condition()) return; await flush(); } assert.fail(document.body.textContent); };
const click = async element => { assert.ok(element); await act(async () => element.click()); await flush(); };
const nav = name => [...document.querySelectorAll('nav button')].find(b => b.textContent.includes(name));

function fixture(t, id, bootstrap = null) {
  const isEee = id === 'DEMO002', requestId = isEee ? 22 : 11, planId = isEee ? 220 : 110;
  const calls = [], unexpected = [];
  const student = { student_id: id, student_name: isEee ? 'Demo EEE Student' : 'Demo Student', programme: isEee ? 'EEE' : 'IEM', admission_year: isEee ? 2025 : 2024, admission_route: isEee ? 'NORMAL_ENTRY' : 'DIRECT_ENTRY', study_year: isEee ? 2 : 3, completed_courses: isEee ? ['MH1810', 'MH1811'] : ['IE2110'] };
  const plans = [0, 1, 2].map(n => ({ plan_id: planId + n, request_id: requestId, plan_name: 'Plan ' + (n + 1), status: 'GENERATED' }));
  const eligibility = { eligible: isEee, can_select: isEee, already_completed: !isEee };
  const key = isEee ? 'DEMO_EEE_2025_NORMAL_V1' : 'DEMO_IEM_2024_DIRECT_V1';
  const respond = data => Response.json({ success: true, data });
  t.mock.method(globalThis, 'fetch', async path => {
    calls.push(path);
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/students/current') return bootstrap ? bootstrap() : respond({ student_id: id });
    if (url.pathname === '/api/students/' + id) return respond(student);
    if (url.pathname === '/api/students/' + id + '/degree-audit') return respond({ records: [], summary: { passed_course_count: isEee ? 12 : 5, earned_au: isEee ? 28 : 16, earned_au_complete: true } });
    if (url.pathname.startsWith('/api/students/' + id + '/curriculum')) return respond({ curriculum: { title: key }, matching: student, categories: [], courses: [] });
    if (url.pathname === '/api/students/' + id + '/eligibility/IE2110') return Response.json({ success: true, ...eligibility });
    if (url.pathname === '/api/courses') return respond([{ course_code: 'IE2110', course_name: 'Signals & Systems', au: 3, academic_year: '2026-2027', semester: 1, course_types: ['CORE'], planning_term: { academic_year: '2026-2027', semester: 1 }, available_for_planning_term: true }]);
    if (url.pathname === '/api/planning-requests' && url.searchParams.get('student_id') === id) return respond([{ request_id: requestId, student_id: id, academic_year: '2026-2027', semester: 1 }]);
    if (url.pathname === '/api/planning-requests/' + requestId) return respond({ request_id: requestId, student_id: id, academic_year: '2026-2027', semester: 1, target_au: 15 });
    if (url.pathname === `/api/planning-requests/${requestId}/plans`) return respond(plans);
    if (url.pathname === `/api/planning-requests/${requestId}/preferences`) return respond({ day_preferences: [], time_preferences: [], objectives: [] });
    if (url.pathname === `/api/planning-requests/${requestId}/active-plan`) return respond({ plan: null });
    if (url.pathname === `/api/plans/${planId}/selected-courses` || url.pathname === `/api/plans/${planId}/indexes`) return respond([]);
    if (url.pathname === `/api/plans/${planId}/timetable`) return respond([]);
    if (url.pathname === `/api/plans/${planId}/blocked-periods`) return respond({ blocked_periods: [] });
    if (url.pathname === `/api/plans/${planId}/summary`) return respond({ plan: plans[0], selected_courses: [], metrics: {}, validation: {} });
    if (url.pathname === '/api/chat/active') return Response.json({ success: true, conversation_id: planId, data: [{ role: 'assistant', content: id + ' shared Leo history', source_channel: 'telegram' }] });
    unexpected.push(path); return Response.json({ success: false, message: 'Unexpected identity request: ' + path }, { status: 404 });
  });
  return { calls, unexpected, requestId, planId, key, student };
}

for (const id of ['DEMO001', 'DEMO002']) test(id + ' bootstrap drives Explorer, Profile, Planner and Leo without a switcher', async t => {
  const api = fixture(t, id);
  await mount();
  await wait(() => api.calls.includes(`/api/students/${id}/eligibility/IE2110?plan_id=${api.planId}`));
  await wait(() => document.querySelector(id === 'DEMO001' ? '.course-card .status.completed' : '.course-card .status.eligible'));
  assert.equal(api.calls[0], '/api/students/current');
  assert.ok(api.calls.includes('/api/planning-requests?student_id=' + id));
  assert.ok(api.calls.includes(`/api/students/${id}/eligibility/IE2110?plan_id=${api.planId}`));
  assert.equal(document.querySelector('.course-action').disabled, id === 'DEMO001');
  await click(nav('Student profile'));
  await wait(() => document.querySelector('[aria-labelledby="profile-audit-title"] .profile-metrics'));
  const profile = document.querySelector('.student-profile').textContent;
  assert.ok(profile.includes(api.student.student_name)); assert.ok(profile.includes(api.student.programme));
  assert.ok(profile.includes(api.key));
  const metric = name => [...document.querySelectorAll('[aria-labelledby="profile-audit-title"] dt')].find(n => n.textContent === name)?.nextElementSibling.textContent;
  assert.equal(metric('Passed courses'), id === 'DEMO001' ? '5' : '12');
  assert.equal(metric('Recorded AU'), id === 'DEMO001' ? '16' : '28');
  await click(nav('My planner'));
  await wait(() => api.calls.includes(`/api/plans/${api.planId}/summary`));
  assert.ok(api.calls.includes(`/api/plans/${api.planId}/indexes`));
  await click(document.querySelector('[aria-label="Open Leo Assistant"]'));
  await wait(() => document.body.textContent.includes(id + ' shared Leo history'));
  assert.ok(api.calls.includes('/api/chat/active'));
  assert.deepEqual(api.unexpected, []);
  const foreign = id === 'DEMO001' ? 'DEMO002' : 'DEMO001';
  assert.ok(api.calls.every(path => !path.includes(foreign)));
});

test('bootstrap waits and fails safely; retry resolves the server identity without a default user', async t => {
  let resolve, failure = false;
  const pending = new Promise(r => { resolve = r; });
  const api = fixture(t, 'DEMO002', () => failure ? Promise.resolve(Response.json({ success: true, data: { student_id: 'DEMO002' } })) : pending);
  sessionStorage.setItem('smart-stars-page', 'profile');
  await mount();
  assert.match(document.body.textContent, /Loading current student/);
  assert.ok(api.calls.every(path => path === '/api/students/current'));
  assert.equal(document.querySelector('.student-profile'), null);
  assert.equal(document.querySelector('[aria-label="Open Leo Assistant"]'), null);
  await act(async () => resolve(Response.json({ success: false, message: 'Active demo student is unavailable' }, { status: 503 })));
  await wait(() => document.querySelector('[role="alert"]'));
  assert.ok(api.calls.every(path => path === '/api/students/current'));
  failure = true;
  await click(document.querySelector('button'));
  await wait(() => document.body.textContent.includes('Demo EEE Student'));
  assert.ok(api.calls.includes('/api/students/DEMO002/degree-audit'));
  assert.deepEqual(api.unexpected, []);
});

test('a malformed bootstrap response does not mount a fallback identity', async t => {
  const api = fixture(t, 'DEMO002', () => Response.json({ success: true, data: {} }));
  await mount(); await wait(() => document.querySelector('[role="alert"]'));
  assert.match(document.body.textContent, /did not provide a current student identity/);
  assert.ok(api.calls.every(path => path === '/api/students/current'));
});
