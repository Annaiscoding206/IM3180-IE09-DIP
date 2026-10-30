import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';

let loadApp, dom, appRoot;
before(async () => { loadApp = await compileModule('main.jsx'); });
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { if (appRoot) await act(async () => appRoot.unmount()); appRoot = null; dom.window.close(); });
const flush = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); });
const mount = async () => {
  await act(async () => { appRoot = (await loadApp()).appRoot; });
  await flush();
};
const nav = label => [...document.querySelectorAll('nav button')].find(button => button.textContent.includes(label));
const click = async button => { await act(async () => button.click()); await flush(); };
const waitFor = async selector => {
  for (let i = 0; i < 40; i++) {
    if (document.querySelector(selector)) return;
    await flush();
  }
  assert.fail(`Did not render ${selector}: ${document.body.textContent}`);
};

function fixtureApi(t, { noPlan = false, requestWithoutPlan = false, failInitialContext = false, courses = [] } = {}) {
  const calls = [], unexpected = [];
  let fail = failInitialContext;
  const request = { request_id: 10, academic_year: '2026-2027', semester: 1, target_au: 15 };
  const plan = { plan_id: 7, plan_name: 'My working plan', status: 'GENERATED' };
  t.mock.method(globalThis, 'fetch', async path => {
    calls.push(path);
    const url = new URL(path, 'http://localhost');
    let data;
    if (url.pathname === '/api/students/DEMO001') data = { student_id: 'DEMO001', student_name: 'Sam Tan', programme: 'CE', study_year: 2, completed_courses: [] };
    else if (url.pathname === '/api/courses') data = courses;
    else if (url.pathname.startsWith('/api/courses/')) data = { ...courses.find(c => c.course_code === url.pathname.split('/')[3]), indexes: [] };
    else if (url.pathname.includes('/eligibility/')) return Response.json({ success: true, eligible: !url.pathname.endsWith('/COREQ'), can_select: true, message: 'Backend academic result' });
    else if (url.pathname === '/api/planning-requests') {
      if (fail) return Response.json({ success: false, message: 'Planning requests unavailable' }, { status: 500 });
      data = noPlan ? [] : [request];
    } else if (url.pathname === '/api/planning-requests/10') data = request;
    else if (url.pathname === '/api/planning-requests/10/plans') data = requestWithoutPlan ? [] : [plan];
    else if (url.pathname === '/api/planning-requests/10/active-plan') data = { plan: null };
    else if (url.pathname === '/api/plans/7/selected-courses') data = [];
    else if (url.pathname.endsWith('/degree-audit')) data = { records: [], summary: { passed_course_count: 0, earned_au: 0, earned_au_complete: true } };
    else if (url.pathname.includes('/curriculum')) data = {
      curriculum: { title: 'Current curriculum' }, categories: [], courses: [],
      planning_context: url.searchParams.has('plan_id') ? { scope: 'EXPLICIT_PLAN', plan_id: Number(url.searchParams.get('plan_id')), plan_name: plan.plan_name, request_id: 10 }
        : { scope: 'ACADEMIC_ONLY' },
    };
    else { unexpected.push(path); return Response.json({ success: false, message: 'Unexpected test request' }, { status: 500 }); }
    return Response.json({ success: true, data });
  });
  return { calls, unexpected, recover() { fail = false; } };
}

test('sidebar and Explorer shortcut open Profile, retain working-plan context, breadcrumb and Leo', async t => {
  const api = fixtureApi(t); await mount();
  assert.equal(document.querySelector('h1').textContent, 'Course Explorer');
  await click(nav('Student profile'));
  await waitFor('.profile-context');
  assert.equal(document.querySelector('h1').textContent, 'Student Profile');
  assert.equal(nav('Student profile').getAttribute('aria-current'), 'page');
  assert.equal(document.querySelector('.topbar strong').textContent, 'Student profile');
  assert.match(document.querySelector('.profile-context').textContent, /My working plan · Plan 7/);
  assert.ok(document.querySelector('[aria-label="Open Leo Assistant"]'));
  assert.ok(nav('My planner'));
  await click(nav('Course explorer'));
  await click(document.querySelector('.degree-audit'));
  assert.equal(document.querySelector('h1').textContent, 'Student Profile');
  assert.ok(api.calls.includes('/api/students/DEMO001/curriculum/progress?plan_id=7'));
  assert.equal(sessionStorage.getItem('smart-stars-page'), 'profile');
  assert.deepEqual(api.unexpected, []);
});

for (const requestWithoutPlan of [false, true]) test(`Explorer retains unavailable courses and separates availability from eligibility (request-only=${requestWithoutPlan})`, async t => {
  const planning_term = { academic_year: '2026-2027', semester: 1 };
  const courses = ['SEM1', 'SEM2', 'BOTH', 'COREQ'].map((course_code, i) => ({ course_code, course_name: course_code,
    au: 3, grading_type: 'LETTER_GRADED', academic_year: '2026-2027', semester: i === 1 ? 2 : 1,
    planning_term, available_for_planning_term: i !== 1, course_types: ['CORE'] }));
  const api = fixtureApi(t, { courses, requestWithoutPlan });
  await mount(); await waitFor('.course-card .status.eligible');
  const cards = [...document.querySelectorAll('.course-card')];
  assert.equal(cards.length, 4);
  for (const [i, card] of cards.entries()) {
    assert.equal(card.querySelector('.status').textContent, i === 3 ? 'Not yet eligible' : 'Eligible', 'Term availability must not change academic status');
    assert.equal(card.querySelector('.course-action').disabled, i === 1);
  }
  assert.match(cards[1].querySelector('.availability').textContent, /Not offered in Semester 1/);
  await click(cards[1].querySelector('.course-action'));
  assert.ok(api.calls.every(path => !path.includes('/selected-courses') || path.endsWith('/plans/7/selected-courses')));
  assert.ok(api.calls.includes(requestWithoutPlan ? '/api/courses?planning_request_id=10' : '/api/courses?plan_id=7'));
  await click(cards[1].querySelector('.detail-link'));
  await waitFor('.dialog-action');
  assert.equal(document.querySelector('.dialog-action').disabled, true);
  assert.match(document.querySelector('[role="dialog"] .availability').textContent, /Not offered in Semester 1/);
  assert.deepEqual(api.unexpected, []);
});

test('refresh restores the Profile page and waits for the app working plan before loading Curriculum', async t => {
  const api = fixtureApi(t);
  sessionStorage.setItem('smart-stars-page', 'profile');
  await mount();
  await waitFor('.profile-context');
  assert.equal(document.querySelector('h1').textContent, 'Student Profile');
  assert.match(document.querySelector('.profile-context').textContent, /My working plan · Plan 7/);
  assert.ok(api.calls.filter(path => path.includes('/curriculum/progress')).every(path => path.endsWith('?plan_id=7')));
  assert.deepEqual(api.unexpected, []);
});

test('Profile refresh without plans uses academic-only context', async t => {
  const api = fixtureApi(t, { noPlan: true }); sessionStorage.setItem('smart-stars-page', 'profile');
  await mount();
  await waitFor('.profile-context');
  assert.match(document.querySelector('.profile-context').textContent, /Academic-only context/);
  assert.ok(api.calls.includes('/api/students/DEMO001/curriculum/progress'));
  assert.deepEqual(api.unexpected, []);
});

test('failed initial planning context can be retried from Profile without hiding academic sections', async t => {
  const api = fixtureApi(t, { failInitialContext: true }); sessionStorage.setItem('smart-stars-page', 'profile');
  await mount();
  await waitFor('.student-profile [role="alert"]');
  assert.match(document.querySelector('.student-profile').textContent, /Planning context could not be loaded/);
  assert.match(document.querySelector('.student-profile').textContent, /No academic attempts recorded/);
  api.recover();
  await click(document.querySelector('[aria-labelledby="profile-curriculum-title"] button'));
  await waitFor('.profile-context');
  assert.match(document.querySelector('.profile-context').textContent, /My working plan · Plan 7/);
  assert.deepEqual(api.unexpected, []);
});

test('export query still routes to ExportPlan independently of saved Profile navigation', async t => {
  dom.reconfigure({ url: 'http://localhost:5173/?exportPlan=7' });
  sessionStorage.setItem('smart-stars-page', 'profile');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async path => {
    calls.push(path);
    return Response.json({ success: false, message: 'Export plan unavailable' }, { status: 404 });
  });
  await mount();
  assert.ok(calls.length > 0 && calls.every(path => path === '/api/plans/7/summary'));
  assert.equal(document.querySelector('.student-profile'), null);
  assert.match(document.body.textContent, /Export plan unavailable/);
});
