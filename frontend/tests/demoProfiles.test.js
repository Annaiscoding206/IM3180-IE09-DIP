import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';

test('the same StudentProfile renders DEMO001 and DEMO002 through identity-specific API helpers', async t => {
  const eee = JSON.parse(readFileSync(new URL('../../database/demo002_profile.json', import.meta.url)));
  const iem = JSON.parse(readFileSync(new URL('../../database/11_programme_curriculum_demo_data.json', import.meta.url)));
  const history = JSON.parse(readFileSync(new URL('../../database/09_degree_audit_demo_data.json', import.meta.url)));
  const oldFetch = globalThis.fetch;
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); globalThis.fetch = oldFetch; });
  const StudentProfile = (await (await compileModule('StudentProfile.jsx'))()).default;
  const iemRecords = [...history.records, ...history.legacy_earned_au.map(r => ({ ...r, result: 'PASSED', grade: null }))];
  const identities = {
    DEMO001: { seed: iem, student: { student_id: 'DEMO001', student_name: 'Demo Student', programme: 'IEM', admission_year: 2024, admission_route: 'DIRECT_ENTRY', study_year: 3 }, records: iemRecords, earned: 16, passed: 5 },
    DEMO002: { seed: eee, student: eee.student, records: eee.records, earned: 28, passed: 12 },
  };
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input, 'http://localhost:5173'); calls.push(url.pathname);
    const [, , , id, ...suffix] = url.pathname.split('/');
    const fixture = identities[id];
    assert.ok(fixture, 'Every request must name the current student');
    let data;
    switch (suffix.join('/')) {
      case '': data = fixture.student; break;
      case 'degree-audit': data = { records: fixture.records.map((r, i) => ({ ...r, record_id: i + 1 })), summary: { earned_au: fixture.earned, earned_au_complete: true, passed_course_count: fixture.passed } }; break;
      case 'curriculum/progress': {
        const completed = new Set(fixture.records.filter(r => r.result === 'PASSED').map(r => r.course_code));
        data = { curriculum: fixture.seed.curriculum, matching: fixture.student,
          summary: { required_au: id === 'DEMO002' ? 71 : 24, completed_au: id === 'DEMO002' ? 28 : 10, remaining_au: id === 'DEMO002' ? 43 : 14, au_complete: true },
          categories: [], courses: fixture.seed.courses.map(c => ({ ...c, status: completed.has(c.course_code) ? 'COMPLETED' : 'NOT_YET_TAKEN', eligible: null, can_select: false,
            eligibility: { message: 'Eligibility cannot be checked for this historical or synthetic course' } })) };
        break;
      }
      default: assert.fail('Unexpected request: ' + url.pathname);
    }
    return Response.json({ success: true, data });
  };
  // Switch identities in place, then switch back. No special EEE rendering path.
  for (const id of ['DEMO001', 'DEMO002', 'DEMO001']) {
    const start = calls.length;
    await act(async () => { root.render(React.createElement(StudentProfile, { studentId: id })); });
    const fixture = identities[id];
    const personal = document.querySelector('[aria-labelledby="profile-personal-title"]');
    for (const value of [id, fixture.student.programme, String(fixture.student.admission_year)]) assert.ok(personal.textContent.includes(value));
    const fields = Object.fromEntries([...personal.querySelectorAll('.profile-fields > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    assert.equal(fields['Study year'], String(fixture.student.study_year));
    assert.equal(fields['Admission route'], id === 'DEMO002' ? 'NORMAL_ENTRY' : 'Direct Entry');
    const audit = document.querySelector('[aria-labelledby="profile-audit-title"]');
    const metrics = Object.fromEntries([...audit.querySelectorAll('.profile-metrics > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    assert.equal(metrics['Recorded AU'], String(fixture.earned));
    assert.equal(metrics['Passed courses'], String(fixture.passed));
    assert.equal(metrics['Earned AU complete'], 'Yes');
    assert.equal(audit.querySelectorAll('tbody tr').length, fixture.records.length);
    const curriculum = document.querySelector('[aria-labelledby="profile-curriculum-title"]');
    if (id === 'DEMO002') {
      assert.match(curriculum.textContent, /Partial Curriculum/);
      assert.equal(curriculum.querySelectorAll('.status-COMPLETED').length, 12);
      assert.equal(curriculum.querySelectorAll('.status-NOT_YET_TAKEN').length, 13);
    }
    assert.deepEqual(calls.slice(start).sort(), ['', '/degree-audit', '/curriculum/progress'].map(s => '/api/students/' + id + s).sort());
  }
});
