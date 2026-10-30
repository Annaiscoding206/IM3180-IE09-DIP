import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';

let StudentProfile, dom, root, host;

before(async () => {
  StudentProfile = (await (await compileModule('StudentProfile.jsx'))()).default;
});

beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost:5173'
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  host = document.getElementById('root');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

const deferred = () => {
  let resolve, reject;

  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });

  return { promise, resolve, reject };
};

const personal = {
  student_id: 'S1',
  student_name: 'Sam Tan',
  programme: 'Computer Engineering',
  study_year: 2,
  admission_year: 2024,
  admission_route: 'DIRECT_ENTRY'
};

const audit = () => ({
  records: ['FAILED', 'PASSED', 'PASSED', 'IN_PROGRESS', 'PASSED']
    .map((result, index) => ({
      record_id: index + 1,
      course_code: index < 3 ? 'A1' : index === 3 ? 'B1' : 'C1',
      course_title: `Attempt ${index + 1}`,
      academic_year: '2025-2026',
      semester: 1,
      result,
      grade: result === 'PASSED' ? 'B' : null,
      earned_au: index === 4
        ? null
        : result === 'PASSED'
          ? 3
          : 0
    })),

  summary: {
    passed_course_count: 2,
    earned_au: 3,
    earned_au_complete: false,
    unknown_au_course_codes: ['C1']
  }
});

const progress = () => ({
  required_au: 24,
  completed_au: 3,
  remaining_au: 21,
  au_complete: false,
  remaining_au_is_upper_bound: true,
  unknown_au_course_codes: ['C1'],
  completed_required_courses: ['A1'],
  remaining_required_courses: ['B1'],
  requirements_satisfied: null
});

function curriculum(plan = null) {
  // Different plans produce different visible course statuses.
  // This allows tests to detect stale responses without displaying plan IDs.
  const b1Planned = plan === 1 || plan === 4;

  return {
    curriculum: {
      curriculum_id: 7,
      curriculum_key: 'CE-2024-DIRECT',
      title: 'Computer Engineering 2024',
      is_demo: 0
    },

    matching: {
      programme: personal.programme,
      admission_year: 2024,
      admission_route: 'DIRECT_ENTRY'
    },

    planning_context: plan == null
      ? {
          scope: 'ACADEMIC_ONLY',
          plan_id: null,
          selected_course_codes: []
        }
      : {
          scope: 'EXPLICIT_PLAN',
          plan_id: plan,
          plan_name: `Plan ${plan}`,
          request_id: 10,
          academic_year: '2026-2027',
          semester: 1,
          plan_status: 'GENERATED',
          selected_course_codes: b1Planned ? ['B1'] : []
        },

    summary: progress(),

    categories: ['CORE', 'MPE', 'ICC', 'BDE']
      .map(category_code => ({
        category_code,
        title: `${category_code} requirements`,
        ...progress(),

        elective_groups: category_code === 'MPE'
          ? [{
              group_code: 'OPTIONS',
              title: 'Choose electives',
              ...progress()
            }]
          : []
      })),

    courses: ['A1', 'B1', 'D1']
      .map((course_code, index) => ({
        course_code,
        course_title: `Course ${course_code}`,
        category_code: 'CORE',

        status: index === 0
          ? 'COMPLETED'
          : index === 1 && b1Planned
            ? 'PLANNED'
            : 'NOT_YET_TAKEN',

        eligible: index === 2,
        can_select: index !== 0,

        eligibility: {
          message: index === 1
            ? 'Missing corequisite: C1'
            : 'Backend explanation',
          requires_review: index === 1
        }
      }))
  };
}

const success = data =>
  Response.json({ success: true, data });

const failure = (
  status,
  code,
  message = 'Backend request failed'
) =>
  Response.json(
    { success: false, code, message },
    { status }
  );

function mockApi(t, overrides = {}) {
  const calls = [];

  t.mock.method(globalThis, 'fetch', async path => {
    const url = new URL(path, 'http://localhost');

    calls.push(url.pathname + url.search);

    if (url.pathname.endsWith('/degree-audit')) {
      return overrides.audit
        ? overrides.audit(url)
        : success(audit());
    }

    if (url.pathname.endsWith('/curriculum/progress')) {
      return overrides.curriculum
        ? overrides.curriculum(url)
        : success(
            curriculum(
              url.searchParams.has('plan_id')
                ? Number(url.searchParams.get('plan_id'))
                : null
            )
          );
    }

    return overrides.personal
      ? overrides.personal(url)
      : success(personal);
  });

  return calls;
}

const render = props =>
  act(async () =>
    root.render(
      React.createElement(StudentProfile, {
        studentId: 'S1',
        ...props
      })
    )
  );

const panel = name =>
  host.querySelector(`[aria-labelledby="profile-${name}-title"]`);

const field = (parent, label) =>
  [...parent.querySelectorAll('dt')]
    .find(dt => dt.textContent === label)
    ?.nextElementSibling.textContent;

const click = element =>
  act(async () => {
    assert.ok(element, 'Button exists');
    element.click();
  });

// Read a course's visible status without relying on internal plan IDs.
const courseStatus = (section, code) => {
  const row = [...section.querySelectorAll('tbody tr')]
    .find(row =>
      row.querySelector('th')?.textContent.startsWith(code)
    );

  assert.ok(row, `${code} must be rendered`);

  return row.querySelector('.profile-badge')?.textContent;
};

// ------------------------------------------------------------
// Test 1: Personal Information
// ------------------------------------------------------------

test(
  'personal and admission fields render from the student API with initials and missing-value placeholders',
  async t => {
    mockApi(t);

    await render();

    for (const [label, expected] of [
      ['Student name', 'Sam Tan'],
      ['Student ID', 'S1'],
      ['Programme', personal.programme],
      ['Study year', '2'],
      ['Admission year / cohort', '2024'],
      ['Admission route', 'Direct Entry']
    ]) {
      assert.equal(
        field(panel('personal'), label),
        expected
      );
    }

    assert.equal(
      panel('personal').querySelector('.profile-avatar').textContent,
      'ST'
    );

    assert.equal(
      panel('personal').querySelector('img'),
      null
    );

    t.mock.method(
      globalThis,
      'fetch',
      async () =>
        success({
          ...personal,
          admission_year: null,
          admission_route: null
        })
    );

    await render({ studentId: 'S2' });

    assert.equal(
      field(panel('personal'), 'Admission year / cohort'),
      'Not recorded'
    );

    assert.equal(
      field(panel('personal'), 'Admission route'),
      'Not recorded'
    );
  }
);

// ------------------------------------------------------------
// Test 2: Degree Audit
// ------------------------------------------------------------

test(
  'Degree Audit preserves repeated attempts, results and unknown AU; totals come from the backend',
  async t => {
    const errors = [];

    t.mock.method(
      console,
      'error',
      (...args) => errors.push(args.join(' '))
    );

    mockApi(t);
    await render();

    const auditPanel = panel('audit');
    const rows = auditPanel.querySelectorAll('tbody tr');

    assert.equal(rows.length, 5);

    assert.deepEqual(
      [...rows].slice(0, 3).map(row =>
        row.querySelector('th').textContent
      ),
      ['A1', 'A1', 'A1']
    );

    assert.deepEqual(
      [...rows].map(row =>
        row.querySelector('.profile-badge').textContent
      ),
      ['FAILED', 'PASSED', 'PASSED', 'IN PROGRESS', 'PASSED']
    );

    // Unknown AU remains visible in the academic record.
    assert.match(rows[4].textContent, /Unknown/);

    assert.match(
      rows[1].textContent,
      /2025-2026/
    );

    assert.equal(
      field(auditPanel, 'Passed courses'),
      '2'
    );

    // The displayed AU must come from the backend summary,
    // not from summing repeated passed attempts.
    assert.equal(
      field(auditPanel, 'Recorded AU'),
      '3',
      'Do not sum repeated passed rows'
    );

    assert.equal(
      field(auditPanel, 'Earned AU complete'),
      'No'
    );

    // Technical warnings are intentionally hidden from students.
    assert.doesNotMatch(
      auditPanel.textContent,
      /Unknown credit for: C1/
    );

    assert.equal(
      auditPanel.querySelector('.profile-warning'),
      null
    );

    assert.equal(
      errors.length,
      0,
      'Stable record IDs must not produce duplicate React keys'
    );
  }
);

// ------------------------------------------------------------
// Test 3: Programme Curriculum
// ------------------------------------------------------------

test(
  'Curriculum renders identity, categories, elective groups and authoritative requirement/AU fields',
  async t => {
    mockApi(t);

    await render({ workingPlanId: 1 });

    const section = panel('curriculum');

    assert.match(
      section.textContent,
      /Computer Engineering 2024/
    );

    // Internal curriculum identifiers must not be displayed.
    assert.doesNotMatch(
      section.textContent,
      /CE-2024-DIRECT/
    );

    // Internal planning-context panel must remain hidden.
    assert.equal(
      section.querySelector('.profile-context'),
      null
    );

    assert.equal(
      field(section, 'Admission route'),
      'Direct Entry'
    );

    for (const code of ['CORE', 'MPE', 'ICC', 'BDE']) {
      assert.ok(
        section.querySelector(
          `[aria-label="${code} requirements"]`
        )
      );
    }

    assert.match(
      section.textContent,
      /OPTIONS · Choose electives/
    );

    assert.equal(
      field(section, 'Required AU'),
      '24'
    );

    assert.equal(
      field(section, 'Recorded completed AU'),
      '3'
    );

    assert.equal(
      field(section, 'Estimated remaining AU'),
      '21'
    );

    assert.equal(
      field(section, 'AU complete'),
      'No'
    );

    assert.equal(
      field(section, 'Requirements satisfied'),
      'Unknown'
    );

    assert.equal(
      field(section, 'Completed requirements'),
      'A1'
    );

    assert.equal(
      field(section, 'Remaining requirements'),
      'B1'
    );

    // The missing-credit warning is hidden in the frontend.
    assert.doesNotMatch(
      section.textContent,
      /Credit is incomplete for: C1/
    );

    assert.equal(
      section.querySelector('.profile-warning'),
      null
    );
  }
);

// ------------------------------------------------------------
// Test 4: Course status and eligibility
// ------------------------------------------------------------

test(
  'status, eligible and can_select occupy separate columns, including planned but ineligible courses',
  async t => {
    mockApi(t);

    await render({ workingPlanId: 1 });

    const rows = [
      ...panel('curriculum').querySelectorAll('tbody tr')
    ];

    assert.deepEqual(
      rows.map(row =>
        row.querySelector('.profile-badge').textContent
      ),
      ['COMPLETED', 'PLANNED', 'NOT YET TAKEN']
    );

    const planned = [...rows[1].children]
      .map(cell => cell.textContent);

    assert.equal(planned[2], 'PLANNED');
    assert.equal(planned[3], 'No');
    assert.equal(planned[4], 'Yes');

    assert.match(
      planned[5],
      /Review required.*Missing corequisite: C1/
    );
  }
);

// ------------------------------------------------------------
// Test 5: Plan switching and selection revisions
// ------------------------------------------------------------

test(
  'explicit plan switch and selection revisions refresh Curriculum while academic requests stay student-wide',
  async t => {
    const calls = mockApi(t);

    await render({ workingPlanId: 1 });

    // Plan 1 includes B1 as a planned course.
    assert.equal(
      courseStatus(panel('curriculum'), 'B1'),
      'PLANNED'
    );

    const before = panel('audit').innerHTML;

    await render({ workingPlanId: 2 });

    // Plan 2 does not include B1.
    assert.equal(
      courseStatus(panel('curriculum'), 'B1'),
      'NOT YET TAKEN'
    );

    // Degree Audit must remain student-wide.
    assert.equal(
      panel('audit').innerHTML,
      before
    );

    await render({
      workingPlanId: 2,
      selectionRevision: 1
    });

    // A selection revision must reload Curriculum.
    assert.deepEqual(
      calls.filter(path => path.includes('/curriculum/')),
      [
        '/api/students/S1/curriculum/progress?plan_id=1',
        '/api/students/S1/curriculum/progress?plan_id=2',
        '/api/students/S1/curriculum/progress?plan_id=2'
      ]
    );

    // Student-wide data must not be fetched again unnecessarily.
    assert.equal(
      calls.filter(path => path.endsWith('/degree-audit')).length,
      1
    );

    assert.equal(
      calls.filter(path => path.endsWith('/S1')).length,
      1
    );

    assert.equal(
      panel('curriculum').querySelector('.profile-context'),
      null
    );
  }
);

// ------------------------------------------------------------
// Test 6: Stale API responses must not overwrite current plan
// ------------------------------------------------------------

test(
  'late success and error from old plans cannot overwrite the active context',
  async t => {
    const oldSuccess = deferred();
    const oldFailure = deferred();

    mockApi(t, {
      curriculum: url => {
        const id = Number(url.searchParams.get('plan_id'));

        if (id === 1) {
          return oldSuccess.promise;
        }

        if (id === 3) {
          return oldFailure.promise;
        }

        return success(curriculum(id));
      }
    });

    await render({ workingPlanId: 1 });

    assert.match(
      panel('curriculum').textContent,
      /Loading Curriculum/
    );

    // Switch to Plan 2 while Plan 1 is still loading.
    await render({ workingPlanId: 2 });

    // Resolve the old Plan 1 request after Plan 2 is active.
    await act(async () =>
      oldSuccess.resolve(success(curriculum(1)))
    );

    // Plan 2 must remain visible, not stale Plan 1.
    assert.equal(
      courseStatus(panel('curriculum'), 'B1'),
      'NOT YET TAKEN'
    );

    // Start a request for Plan 3 that will fail later.
    await render({ workingPlanId: 3 });

    assert.match(
      panel('curriculum').textContent,
      /Loading Curriculum/
    );

    // Switch to Plan 4 before the old failure arrives.
    await render({ workingPlanId: 4 });

    await act(async () =>
      oldFailure.reject(Error('old plan failed'))
    );

    // The old error must not replace Plan 4's content.
    assert.equal(
      courseStatus(panel('curriculum'), 'B1'),
      'PLANNED'
    );

    assert.equal(
      panel('curriculum').querySelector('[role="alert"]'),
      null
    );
  }
);

// ------------------------------------------------------------
// Test 7: Academic-only context
// ------------------------------------------------------------

test(
  'no plan uses an academic-only request and never infers another plan',
  async t => {
    const calls = mockApi(t);

    await render();

    assert.ok(
      calls.includes(
        '/api/students/S1/curriculum/progress'
      )
    );

    assert.ok(
      calls.every(path =>
        !path.includes('plan_id') &&
        !path.includes('request_id')
      )
    );

    // The internal planning-context panel should not appear.
    assert.equal(
      panel('curriculum').querySelector('.profile-context'),
      null
    );

    // Academic-only mode must not invent planned courses.
    assert.doesNotMatch(
      panel('curriculum').textContent,
      /PLANNED/
    );
  }
);

// ------------------------------------------------------------
// Test 8: Independent loading and empty states
// ------------------------------------------------------------

test(
  'personal, audit and Curriculum have independent loading and empty states',
  async t => {
    const student = deferred();
    const academic = deferred();
    const requirements = deferred();

    mockApi(t, {
      personal: () => student.promise,
      audit: () => academic.promise,
      curriculum: () => requirements.promise
    });

    await render();

    assert.equal(
      host.querySelectorAll('[role="status"]').length,
      3
    );

    await act(async () =>
      student.resolve(success(personal))
    );

    assert.match(
      panel('personal').textContent,
      /Sam Tan/
    );

    assert.equal(
      host.querySelectorAll('[role="status"]').length,
      2
    );

    await act(async () =>
      academic.resolve(
        success({
          records: [],
          summary: {
            passed_course_count: 0,
            earned_au: 0,
            earned_au_complete: true
          }
        })
      )
    );

    assert.match(
      panel('audit').textContent,
      /No academic attempts recorded/
    );

    assert.equal(
      field(panel('audit'), 'Recorded AU'),
      '0'
    );

    assert.equal(
      field(panel('audit'), 'Earned AU complete'),
      'Yes'
    );

    await act(async () =>
      requirements.resolve(
        success({
          ...curriculum(),
          courses: [],
          categories: []
        })
      )
    );

    assert.match(
      panel('curriculum').textContent,
      /No curriculum categories recorded/
    );

    assert.match(
      panel('curriculum').textContent,
      /No curriculum courses recorded/
    );

    assert.equal(
      host.querySelectorAll('table').length,
      0
    );
  }
);

// ------------------------------------------------------------
// Test 9: Curriculum API failures and retry
// ------------------------------------------------------------

for (const [status, code, title] of [
  [404, 'NO_CURRICULUM', 'No matching curriculum'],
  [409, 'AMBIGUOUS_CURRICULUM', 'Curriculum match needs review'],
  [401, undefined, 'Student access required'],
  [403, undefined, 'Student access required'],
  [404, undefined, 'Student or planning context unavailable'],
  [500, undefined, 'Could not load Curriculum']
]) {
  test(
    `Curriculum failure ${code || status} is explicit and can be retried independently`,
    async t => {
      let failed = true;

      const calls = mockApi(t, {
        curriculum: () =>
          failed
            ? failure(status, code)
            : success(curriculum())
      });

      await render();

      assert.match(
        panel('curriculum')
          .querySelector('[role="alert"]')
          .textContent,
        new RegExp(title)
      );

      assert.equal(
        panel('curriculum').querySelector('table'),
        null
      );

      assert.equal(
        panel('audit').querySelectorAll('tbody tr').length,
        5
      );

      failed = false;

      await click(
        panel('curriculum').querySelector('button')
      );

      assert.equal(
        panel('curriculum').querySelector('[role="alert"]'),
        null
      );

      assert.ok(
        panel('curriculum').querySelector('table')
      );

      assert.equal(
        calls.filter(path =>
          path.endsWith('/degree-audit')
        ).length,
        1
      );
    }
  );
}

// ------------------------------------------------------------
// Test 10: Degree Audit error recovery
// ------------------------------------------------------------

test(
  'failed academic API is not shown as an empty table; retry shows loading then recovers',
  async t => {
    const retry = deferred();
    let attempts = 0;

    mockApi(t, {
      audit: () =>
        ++attempts === 1
          ? failure(500, undefined, 'Audit unavailable')
          : retry.promise
    });

    await render();

    assert.match(
      panel('audit').textContent,
      /Audit unavailable/
    );

    assert.doesNotMatch(
      panel('audit').textContent,
      /No academic attempts/
    );

    await click(
      panel('audit').querySelector('button')
    );

    assert.match(
      panel('audit').textContent,
      /Loading Degree Audit/
    );

    await act(async () =>
      retry.resolve(success(audit()))
    );

    assert.equal(
      panel('audit').querySelectorAll('tbody tr').length,
      5
    );
  }
);

// ------------------------------------------------------------
// Test 11: Personal Information error recovery
// ------------------------------------------------------------

test(
  'personal identity failure remains explicit while other sections can load',
  async t => {
    let failed = true;

    mockApi(t, {
      personal: () =>
        failed
          ? failure(401, undefined, 'Student identity required')
          : success(personal)
    });

    await render();

    assert.match(
      panel('personal').textContent,
      /Student access required/
    );

    assert.ok(
      panel('audit').querySelector('table')
    );

    failed = false;

    await click(
      panel('personal').querySelector('button')
    );

    assert.equal(
      field(panel('personal'), 'Student ID'),
      'S1'
    );
  }
);

// ------------------------------------------------------------
// Test 12: Unresolved planning context
// ------------------------------------------------------------

test(
  'unresolved app context waits instead of guessing academic-only; context error offers retry',
  async t => {
    const calls = mockApi(t);
    let retries = 0;

    await render({
      planningLoading: true
    });

    assert.equal(
      calls.filter(path =>
        path.includes('/curriculum/')
      ).length,
      0
    );

    assert.match(
      panel('curriculum').textContent,
      /Loading Curriculum/
    );

    await render({
      planningError: 'Request list unavailable',
      onRetryPlanning: () => retries++
    });

    assert.match(
      panel('curriculum').textContent,
      /Planning context could not be loaded/
    );

    await click(
      panel('curriculum').querySelector('button')
    );

    assert.equal(retries, 1);

    await render({
      workingPlanId: 2
    });

    assert.ok(
      calls.includes(
        '/api/students/S1/curriculum/progress?plan_id=2'
      )
    );
  }
);