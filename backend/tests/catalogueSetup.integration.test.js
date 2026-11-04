const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { importCatalogue, normalizeSnapshot, ensureUnknownGrading } = require('../scripts/setupCatalogue.cjs');
const snapshot = require('../../database/catalogue/2026_1_ie2108_ie2110.json');
const foundationSnapshots = [
  require('../../database/catalogue/2026_1_eee_foundation.json'),
  require('../../database/catalogue/2026_2_eee_foundation.json'),
];
const coreSnapshots = [
  require('../../database/catalogue/2026_1_eee_core.json'),
  require('../../database/catalogue/2026_2_eee_core.json'),
];

test('three-course core batch preserves semester counts, source weeks and excludes unsupported EE2073', () => {
  const expected = [[[20, 40], [7, 10], [9, 18]], [[7, 31], [17, 34], [22, 88]]];
  const keys = new Set();
  let supplemented = 0;
  for (const [n, seed] of coreSnapshots.entries()) {
    assert.equal(seed.semester, n + 1);
    assert.deepEqual(seed.courses.map(c => c.course_code), ['EE2103', 'EE2005', 'IE2107']);
    for (const [i, c] of normalizeSnapshot(seed).entries()) {
      assert.equal(c.grading_type, 'LETTER_GRADED'); assert.equal(c.au, 3);
      assert.deepEqual([c.indexes.length, c.indexes.reduce((sum, index) => sum + index.slots.length, 0)], expected[n][i]);
      for (const index of c.indexes) {
        const key = c.course_code + '/' + index.index; assert.ok(!keys.has(key)); keys.add(key);
        assert.ok(index.slots.every(slot => slot[5] && slot[6]));
      }
      for (const slot of Object.values(seed.courses[i].indexes).flat()) if (Object.hasOwn(slot, 'source_remarks')) {
        supplemented++; assert.equal(slot.source_remarks, ''); assert.equal(slot.remarks, 'Teaching Wk1-13');
      }
    }
  }
  assert.equal(keys.size, 82); assert.equal(supplemented, 65);
  const explicitLab = normalizeSnapshot(coreSnapshots[0])[1].indexes.flatMap(i => i.slots).filter(s => s[0] === 'LAB');
  assert.ok(explicitLab.every(s => ['6,12', '7,13'].includes(s[6])));
});

test('six-course snapshots preserve both semesters without course/index collisions and with user-confirmed grading/weeks', () => {
  const counts = [
    { IE1005: [19, 57], IE0005: [4, 8], IE2104: [15, 30], IE2106: [21, 42], EE2101: [18, 54], EE2102: [9, 27] },
    { IE0005: [20, 60], IE2104: [5, 21], IE2106: [2, 8], EE2101: [5, 21], EE2102: [14, 70] },
  ];
  const keys = new Set();
  for (const [i, seed] of foundationSnapshots.entries()) {
    assert.equal(seed.academic_year, '2026-2027');
    assert.equal(seed.semester, i + 1);
    assert.equal(seed.source_semester, `2026_${i + 1}`);
    assert.deepEqual(seed.courses.map(c => c.course_code), Object.keys(counts[i]));
    for (const course of normalizeSnapshot(seed)) {
      assert.equal(course.au, 3);
      assert.equal(course.grading_type, 'LETTER_GRADED');
      assert.deepEqual(course.course_types, []);
      assert.equal(course.prerequisite_text, null);
      assert.equal(course.restriction_text, null);
      assert.equal(course.mutually_exclusive_text, null);
      assert.deepEqual([course.indexes.length, course.indexes.reduce((n, index) => n + index.slots.length, 0)], counts[i][course.course_code]);
      for (const index of course.indexes) {
        const key = `${course.course_code}/${index.index}`;
        assert.ok(!keys.has(key), `Cross-semester key collision: ${key}`);
        keys.add(key);
        for (const slot of index.slots) {
          assert.ok(slot[5], 'Keep the published venue');
          assert.ok(slot[6], 'Every slot has source or user-confirmed teaching weeks');
        }
      }
    }
  }
  assert.equal(keys.size, 132);
  const supplemented = foundationSnapshots.flatMap(seed => seed.courses.flatMap(c =>
    Object.values(c.indexes).flat().filter(slot => Object.hasOwn(slot, 'source_remarks'))));
  assert.equal(supplemented.length, 109);
  assert.ok(supplemented.every(slot => slot.source_remarks === '' && slot.remarks === 'Teaching Wk1-13'));
  const first = normalizeSnapshot(foundationSnapshots[0]);
  assert.deepEqual(first[0].indexes[0].slots[0], ['LECTURE', 'EELE', 'WED', '16:30:00', '18:20:00', 'LKC-LT', '1-12']);
  assert.ok(first[2].indexes.every(index => index.slots.every(slot => slot[6] === '1-13')), 'Previously blank IE2104 weeks use the user-confirmed range');
  assert.equal(normalizeSnapshot(foundationSnapshots[1])[0].indexes[0].slots[1][5], 'ONLINE');
  assert.equal(normalizeSnapshot(foundationSnapshots[1])[0].indexes[0].slots[1][6], '10');
});

test('IE2108 and IE2110 snapshot specifies Letter Graded and preserves Semester 1 indexes and times', () => {
  const courses = normalizeSnapshot(snapshot);
  assert.deepEqual(courses.map(course => course.course_code), ['IE2108', 'IE2110']);
  assert.equal(snapshot.source_semester, '2026_1');
  assert.deepEqual(courses[0].indexes.map(row => row.index), [32261, 32262, 32263, 32264, 32265, 32266, 32267, 32268, 32269, 37527, 37528]);
  assert.deepEqual(courses[1].indexes.map(row => row.index), [32391, 32392, 32393, 32394, 32395, 32396, 32397, 32398, 32399, 32400, 32401]);
  assert.equal(courses.flatMap(c => c.indexes.flatMap(i => i.slots)).length, 33);
  assert.deepEqual(courses[0].indexes[0].slots[0], ['LECTURE', 'EELE', 'MON', '09:30:00', '10:50:00', 'LT24', '1-13']);
  for (const course of courses) {
    assert.equal(course.au, 3);
    assert.equal(course.grading_type, 'LETTER_GRADED');
    assert.equal(course.prerequisite_text, null, 'Do not borrow latest-semester prerequisites');
    assert.deepEqual(course.course_types, ['CORE']);
    assert.ok(course.indexes.every(index => index.slots.every(slot => slot[6] === '1-13')));
  }
  assert.ok(courses[1].indexes.every(index => index.slots.length === 1 && index.slots[0][0] === 'TUTORIAL'));
  assert.equal(courses[0].mutually_exclusive_text, 'SC5001');
  for (const sources of Object.values(snapshot.sources)) assert.match(sources.sha256, /^[a-f0-9]{64}$/);
});

test('import refuses ambiguous terms, unrepresentable slots and unsupported week remarks', () => {
  for (const mutate of [
    seed => { seed.semester = 2; },
    seed => { seed.courses[0].indexes['32261'][0].key = '999'; },
    seed => { seed.courses[0].indexes['32261'][0].day = 0; },
    seed => { seed.courses[0].indexes['32261'][0].remarks = 'Alternate weeks'; },
    seed => { seed.courses[0].indexes['32261'][0].remarks = 'Teaching Wk13-1'; },
    seed => { seed.courses[0].indexes['32261'][0].time = '0990-1050'; },
  ]) {
    const seed = structuredClone(snapshot); mutate(seed);
    assert.throws(() => normalizeSnapshot(seed));
  }
  const seed = structuredClone(snapshot);
  seed.courses[0].indexes['32261'][0].remarks = 'Teaching Wk1-9,11-13';
  assert.equal(normalizeSnapshot(seed)[0].indexes[0].slots[0][6], '1-9,11-13');
});

test('catalogue extension is atomic, repeatable and preserves planning/history over MySQL/HTTP', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  assert.equal(process.env.DB_NAME, 'stars_companion_db');
  const pool = require('../src/config/db');
  const audit = require('../src/services/degreeAuditService');
  const eligibility = require('../src/services/eligibilityService');
  const prefix = 'C' + randomBytes(3).toString('hex').toUpperCase();
  const student = prefix + 'S';
  const seed = structuredClone(snapshot);
  seed.courses.forEach((course, i) => { course.course_code = prefix + i; });
  const codes = seed.courses.map(course => course.course_code);
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query('DELETE FROM student WHERE student_id = ?', [student]);
      for (const code of codes) {
        await pool.query('DELETE FROM course_info WHERE course_code = ?', [code]);
        await pool.query('DELETE FROM course_type WHERE course_code = ?', [code]);
      }
    } finally { await pool.end(); }
  });
  const protectedTables = ['academic_record', 'completed_course', 'student', 'planning_request', 'planning_request_course',
    'planning_day_preference', 'planning_time_preference', 'planning_objective', 'planning_blocked_period',
    'plan', 'plan_course', 'plan_selected_course', 'plan_blocked_period',
    'course_requirement', 'mutual_exclusion', 'programme_restriction', 'curriculum_course', 'curriculum_category'];
  async function capture(tables) {
    const result = {};
    for (const table of tables) result[table] = (await pool.query(`SELECT * FROM ${table}`))[0].map(row => JSON.stringify(row)).sort();
    return result;
  }
  const catalogue = () => capture(['course_info', 'course_type', 'class_slots']);
  await pool.query("INSERT INTO student (student_id, programme, study_year) VALUES (?, 'TEST', 2)", [student]);
  await pool.query("INSERT INTO academic_record (student_id, course_code, result, earned_au, source, source_key) VALUES (?, ?, 'PASSED', 3, 'LEGACY_COMPLETED', 'legacy-test')", [student, codes[0]]);
  await pool.query('INSERT INTO completed_course (student_id, course_code) VALUES (?, ?)', [student, codes[0]]);
  const before = await capture(protectedTables);
  const summary = await audit.getCompletionSummary(student);
  const legacySeed = structuredClone(seed);
  legacySeed.courses.forEach(course => {
    course.grading_type = null;
    for (const slot of Object.values(course.indexes).flat()) slot.remarks = slot.source_remarks;
  });
  const first = await importCatalogue(pool, legacySeed);
  assert.equal(first.indexes_inserted, 22);
  assert.equal(first.slots_inserted, 33);
  assert.equal(first.types_inserted, 2);
  assert.deepEqual(await capture(protectedTables), before);
  assert.deepEqual(await audit.getCompletionSummary(student), summary);

  const [request] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [student]);
  const [plan] = await pool.query("INSERT INTO plan (request_id, plan_name, status) VALUES (?, 'Catalogue preservation test', 'SELECTED')", [request.insertId]);
  await pool.query('INSERT INTO plan_selected_course (plan_id, course_code) VALUES (?, ?)', [plan.insertId, codes[1]]);
  await pool.query('INSERT INTO planning_request_course (request_id, course_code) VALUES (?, ?)', [request.insertId, codes[1]]);
  await pool.query('INSERT INTO plan_course (plan_id, course_code, index_no, locked) VALUES (?, ?, 32391, TRUE)', [plan.insertId, codes[1]]);
  await pool.query("INSERT INTO plan_blocked_period (plan_id, day_of_week, start_time, end_time) VALUES (?, 'SAT', '08:00', '09:00')", [plan.insertId]);
  await pool.query("INSERT INTO planning_blocked_period (request_id, day_of_week, start_time, end_time) VALUES (?, 'SUN', '10:00', '11:00')", [request.insertId]);
  await pool.query("INSERT INTO planning_day_preference (request_id, day_of_week, preference_type) VALUES (?, 'FRI', 'AVOID')", [request.insertId]);
  await pool.query('UPDATE course_info SET vacancy = 7, vacancy_updated_at = NOW() WHERE course_code = ? AND index_no = 32391', [codes[1]]);

  await t.test('enrich 22 unknown indexes and 33 unspecified weeks without altering other records', async () => {
    const expected = await capture(protectedTables), expectedCatalogue = await catalogue();
    expectedCatalogue.course_info = expectedCatalogue.course_info.map(value => {
      const row = JSON.parse(value);
      if (codes.includes(row.course_code)) row.grading_type = 'LETTER_GRADED';
      return JSON.stringify(row);
    }).sort();
    expectedCatalogue.class_slots = expectedCatalogue.class_slots.map(value => {
      const row = JSON.parse(value);
      if (codes.includes(row.course_code)) row.teaching_weeks = '1-13';
      return JSON.stringify(row);
    }).sort();
    assert.deepEqual(await importCatalogue(pool, seed), { schema_changed: false, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0, grading_updated: 22, teaching_weeks_updated: 33 });
    assert.deepEqual(await capture(protectedTables), expected);
    assert.deepEqual(await catalogue(), expectedCatalogue);
    for (const code of codes) {
      const [rows] = await pool.query('SELECT grading_type FROM course_info WHERE course_code = ?', [code]);
      assert.equal(rows.length, 11);
      assert.ok(rows.every(row => row.grading_type === 'LETTER_GRADED'));
    }
  });

  await t.test('repeat imports preserve all rows, IDs, vacancy updates, locks, blocks and history', async () => {
    const expected = await capture(protectedTables), expectedCatalogue = await catalogue();
    for (let i = 0; i < 2; i++) assert.deepEqual(await importCatalogue(pool, seed), { schema_changed: false, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0 });
    assert.equal(await ensureUnknownGrading(pool), false);
    assert.deepEqual(await capture(protectedTables), expected);
    assert.deepEqual(await catalogue(), expectedCatalogue);
    assert.equal((await eligibility.evaluateEligibility(student, codes[0], pool, null, [])).can_select, false);
    assert.equal((await audit.getCompletionSummary(student)).earned_au, 3);
  });

  await t.test('known grading cannot be overwritten or downgraded, and late conflicts roll back enrichment', async () => {
    const expected = await catalogue();
    await assert.rejects(importCatalogue(pool, legacySeed), /metadata\/term conflict/);
    const conflicting = structuredClone(seed); conflicting.courses[1].grading_type = 'PASS_FAIL';
    await assert.rejects(importCatalogue(pool, conflicting), /metadata\/term conflict/);
    assert.deepEqual(await catalogue(), expected);
    await pool.query('UPDATE course_info SET grading_type = NULL WHERE course_code = ?', [codes[0]]);
    const before = await catalogue();
    await assert.rejects(importCatalogue(pool, conflicting), /metadata\/term conflict/);
    assert.deepEqual(await catalogue(), before, 'Early enrichment rolls back after a later conflict');
    assert.equal((await importCatalogue(pool, seed)).grading_updated, 11);
    assert.deepEqual(await catalogue(), expected);
  });

  await t.test('term, metadata and slot conflicts roll back without changing existing plans', async () => {
    const expected = await capture(protectedTables), expectedCatalogue = await catalogue();
    const term = structuredClone(seed); term.semester = 2; term.source_semester = '2026_2';
    await assert.rejects(importCatalogue(pool, term), /metadata\/term conflict/);
    const conflict = structuredClone(seed);
    // This new index is inserted before the late conflict; rollback must remove it.
    conflict.courses[0].indexes['999900'] = structuredClone(conflict.courses[0].indexes['32261']).map(s => ({ ...s, key: '999900' }));
    conflict.courses[1].course_name = 'Conflicting metadata';
    await assert.rejects(importCatalogue(pool, conflict), /metadata\/term conflict/);
    const slot = structuredClone(seed); slot.courses[1].indexes['32391'][0].venue = 'Changed venue';
    await assert.rejects(importCatalogue(pool, slot), /slot conflict/);
    assert.deepEqual(await catalogue(), expectedCatalogue);
    assert.deepEqual(await capture(protectedTables), expected);
  });

  await t.test('real course APIs filter semester/year and return every persisted index and slot', async () => {
    const app = require('express')();
    app.use('/api/courses', require('../src/routes/courseRoutes'));
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const get = async suffix => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/courses${suffix}`);
      assert.equal(response.status, 200); return response.json();
    };
    const rows = (await get(`?academic_year=2026-2027&semester=1&search=${prefix}`)).data;
    assert.deepEqual(rows.map(row => row.course_code).sort(), codes);
    assert.ok(rows.every(row => row.au === 3 && row.grading_type === 'LETTER_GRADED' && row.course_types.join() === 'CORE'));
    for (const query of ['academic_year=2026-2027&semester=2', 'academic_year=2025-2026&semester=1']) {
      assert.equal((await get(`?${query}&search=${prefix}`)).data.length, 0);
    }
    for (const course of normalizeSnapshot(seed)) {
      const indexes = (await get(`/${course.course_code}/indexes`)).data;
      assert.deepEqual(indexes.map(row => row.index_no), course.indexes.map(row => row.index));
      for (const index of course.indexes) {
        const timetable = await get(`/${course.course_code}/indexes/${index.index}/timetable`);
        assert.equal(timetable.timetable_available, true);
        const values = timetable.data.map(row => ['class_type', 'class_group', 'day_of_week', 'start_time', 'end_time', 'venue', 'teaching_weeks'].map(f => row[f]));
        assert.deepEqual(values.map(JSON.stringify).sort(), index.slots.map(JSON.stringify).sort());
      }
    }
  });

  await t.test('generation accepts historical slots with confirmed weeks and preserves an explicit index lock', async () => {
    const { generatePlans } = require('../src/services/generationService');
    const result = await generatePlans(request.insertId, student, { source_plan_id: plan.insertId });
    assert.ok(result.plans.length > 0);
    for (const generated of result.plans) {
      assert.deepEqual(generated.indexes, [{ course_code: codes[1], index_no: 32391, locked: true }]);
    }
    assert.equal((await audit.getCompletionSummary(student)).earned_au, 3);
  });

  await t.test('six-course multi-term import persists 132 indexes/398 slots, preserves every existing row and exposes term availability', async () => {
    const seeds = structuredClone(foundationSnapshots);
    const names = foundationSnapshots[0].courses.map(c => c.course_code);
    const newCodes = names.map((_, i) => prefix + 'N' + i);
    codes.push(...newCodes); // Register cleanup before any insertion.
    for (const seed of seeds) for (const c of seed.courses) c.course_code = newCodes[names.indexOf(c.course_code)];
    const contexts = [];
    for (const [year, semester] of [['2026-2027', 1], ['2026-2027', 2], ['2025-2026', 1]]) {
      const [r] = await pool.query('INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, ?, ?)', [student, year, semester]);
      const [p] = await pool.query("INSERT INTO plan (request_id, plan_name) VALUES (?, 'Foundation availability')", [r.insertId]);
      contexts.push({ request_id: r.insertId, plan_id: p.insertId, academic_year: year, semester });
    }
    const [tables] = await pool.query('SHOW TABLES');
    const allTables = tables.map(row => Object.values(row)[0]);
    const before = await capture(allTables);
    const originalSeeds = structuredClone(seeds);
    for (const seed of originalSeeds) for (const course of seed.courses) {
      course.grading_type = null;
      for (const slot of Object.values(course.indexes).flat()) {
        if (Object.hasOwn(slot, 'source_remarks')) slot.remarks = slot.source_remarks;
      }
    }
    for (const [i, seed] of originalSeeds.entries()) assert.deepEqual(await importCatalogue(pool, seed), {
      schema_changed: false, indexes_inserted: i === 0 ? 86 : 46,
      slots_inserted: i === 0 ? 218 : 180, types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0,
    });
    const beforeEnrichment = await capture(allTables);
    // A late conflict must roll back both grading and any earlier week enrichments.
    const conflict = structuredClone(seeds[0]);
    conflict.courses.at(-1).course_name = 'Conflicting metadata';
    await assert.rejects(importCatalogue(pool, conflict), /metadata\/term conflict/);
    assert.deepEqual(await capture(allTables), beforeEnrichment);
    // Never overwrite an explicit source range, even with a confirmed value.
    const explicit = structuredClone(seeds[0]);
    Object.values(explicit.courses[0].indexes)[0][0].remarks = 'Teaching Wk1-13';
    await assert.rejects(importCatalogue(pool, explicit), /slot conflict/);
    assert.deepEqual(await capture(allTables), beforeEnrichment);
    // A NULL row cannot safely be assigned to either of two identical sessions
    // with different week ranges; refuse rather than duplicate or guess.
    const ambiguous = structuredClone(seeds[0]);
    const slots = Object.values(ambiguous.courses[2].indexes)[0];
    slots[0].remarks = 'Teaching Wk1-6';
    slots.push({ ...slots[0], remarks: 'Teaching Wk7-13' });
    await assert.rejects(importCatalogue(pool, ambiguous), /slot conflict/);
    assert.deepEqual(await capture(allTables), beforeEnrichment);
    for (const [i, seed] of seeds.entries()) assert.deepEqual(await importCatalogue(pool, seed), {
      schema_changed: false, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0,
      grading_updated: i === 0 ? 86 : 46, teaching_weeks_updated: i === 0 ? 109 : 0,
    });
    const after = await capture(allTables);
    const enrichedExpected = structuredClone(beforeEnrichment);
    enrichedExpected.course_info = enrichedExpected.course_info.map(value => {
      const row = JSON.parse(value);
      if (newCodes.includes(row.course_code)) row.grading_type = 'LETTER_GRADED';
      return JSON.stringify(row);
    }).sort();
    enrichedExpected.class_slots = enrichedExpected.class_slots.map(value => {
      const row = JSON.parse(value);
      if (newCodes.includes(row.course_code) && row.teaching_weeks === null) row.teaching_weeks = '1-13';
      return JSON.stringify(row);
    }).sort();
    assert.deepEqual(after, enrichedExpected, 'Only unknown grading/weeks change; explicit weeks and every other field are preserved');
    const downgrade = structuredClone(originalSeeds[0]);
    downgrade.courses.forEach(course => { course.grading_type = 'LETTER_GRADED'; });
    await assert.rejects(importCatalogue(pool, downgrade), /slot conflict/);
    assert.deepEqual(await capture(allTables), after, 'Published weeks cannot be erased by an old snapshot');
    for (const table of allTables) {
      if (['course_info', 'class_slots'].includes(table)) {
        assert.deepEqual(after[table].filter(value => !newCodes.includes(JSON.parse(value).course_code)), before[table], table);
      } else assert.deepEqual(after[table], before[table], table);
    }
    for (let n = 0; n < 2; n++) for (const seed of seeds) assert.deepEqual(await importCatalogue(pool, seed), {
      schema_changed: false, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0,
    });
    assert.deepEqual(await capture(allTables), after, 'Repeat imports change no row or timestamp');

    const app = require('express')();
    app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
    app.use('/api/courses', require('../src/routes/courseRoutes'));
    const apiServer = app.listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    try {
      const get = async suffix => {
        const response = await fetch(`http://127.0.0.1:${apiServer.address().port}/api/courses${suffix}`);
        assert.equal(response.status, 200); return (await response.json()).data;
      };
      const list = suffix => get(`?search=${prefix}N${suffix}`);
      assert.equal((await list('')).length, 6, 'Unfiltered Explorer includes every course once');
      assert.equal((await list('&academic_year=2026-2027&semester=1')).length, 6);
      assert.equal((await list('&academic_year=2026-2027&semester=2')).length, 5);
      assert.equal((await list('&academic_year=2025-2026')).length, 0);
      for (const context of contexts) for (const parameter of ['plan_id', 'planning_request_id']) {
        const rows = await list(`&${parameter}=${context[parameter === 'plan_id' ? 'plan_id' : 'request_id']}`);
        assert.equal(rows.length, 6, 'Planning context does not hide unavailable courses');
        for (const row of rows) {
          const available = context.academic_year === '2026-2027' && (context.semester === 1 || row.course_code !== newCodes[0]);
          assert.equal(row.available_for_planning_term, available);
          assert.deepEqual(row.planning_term, { academic_year: context.academic_year, semester: context.semester });
          assert.deepEqual(row.available_semesters.map(t => t.semester), row.course_code === newCodes[0] ? [1] : [1, 2]);
          assert.equal(row.grading_type, 'LETTER_GRADED');
        }
      }
      for (const code of newCodes) {
        const expected = seeds.flatMap(seed => normalizeSnapshot(seed).filter(c => c.course_code === code)
          .flatMap(c => c.indexes.map(index => ({ ...index, semester: seed.semester }))));
        const indexes = await get(`/${code}/indexes`);
        assert.deepEqual(indexes.map(i => i.index_no).sort(), expected.map(i => i.index).sort());
        const detail = await get(`/${code}`);
        assert.deepEqual(detail.indexes.map(i => [i.index_no, i.semester]).sort(), expected.map(i => [i.index, i.semester]).sort());
        for (const index of expected) {
          const slots = await get(`/${code}/indexes/${index.index}/timetable`);
          const fields = ['class_type', 'class_group', 'day_of_week', 'start_time', 'end_time', 'venue', 'teaching_weeks'];
          assert.deepEqual(slots.map(row => JSON.stringify(fields.map(f => row[f]))).sort(), index.slots.map(JSON.stringify).sort());
        }
      }
      assert.deepEqual(await capture(allTables), after, 'Catalogue API reads do not mutate any records');
    } finally { await new Promise(resolve => apiServer.close(resolve)); }
  });

  await t.test('three-course import preserves existing records, repeats without writes and exposes both terms', async () => {
    const seeds = structuredClone(coreSnapshots);
    const names = seeds[0].courses.map(c => c.course_code);
    const newCodes = names.map((_, i) => prefix + 'R' + i);
    codes.push(...newCodes);
    for (const seed of seeds) for (const c of seed.courses) c.course_code = newCodes[names.indexOf(c.course_code)];
    const contexts = [];
    for (const [year, semester] of [['2026-2027', 1], ['2026-2027', 2], ['2025-2026', 1]]) {
      const [r] = await pool.query('INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, ?, ?)', [student, year, semester]);
      const [p] = await pool.query("INSERT INTO plan (request_id, plan_name) VALUES (?, 'Core catalogue fixture')", [r.insertId]);
      contexts.push({ request_id: r.insertId, plan_id: p.insertId, academic_year: year, semester });
    }
    const [tables] = await pool.query('SHOW TABLES');
    const allTables = tables.map(row => Object.values(row)[0]);
    const before = await capture(allTables);
    for (const [i, seed] of seeds.entries()) assert.deepEqual(await importCatalogue(pool, seed), {
      schema_changed: false, indexes_inserted: i === 0 ? 36 : 46, slots_inserted: i === 0 ? 68 : 153,
      types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0,
    });
    const after = await capture(allTables);
    for (const table of allTables) {
      const retained = ['course_info', 'class_slots'].includes(table)
        ? after[table].filter(value => !newCodes.includes(JSON.parse(value).course_code)) : after[table];
      assert.deepEqual(retained, before[table], table + ' existing rows preserved');
    }
    for (let n = 0; n < 2; n++) for (const seed of seeds) assert.deepEqual(await importCatalogue(pool, seed), {
      schema_changed: false, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0,
    });
    assert.deepEqual(await capture(allTables), after);
    const app = require('express')();
    app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
    app.use('/api/courses', require('../src/routes/courseRoutes'));
    const apiServer = app.listen(0, '127.0.0.1'); await once(apiServer, 'listening');
    try {
      const get = async suffix => {
        const response = await fetch(`http://127.0.0.1:${apiServer.address().port}/api/courses${suffix}`);
        assert.equal(response.status, 200); return (await response.json()).data;
      };
      const list = suffix => get(`?search=${prefix}R${suffix}`);
      for (const query of ['', '&academic_year=2026-2027&semester=1', '&academic_year=2026-2027&semester=2']) {
        assert.equal((await list(query)).length, 3);
      }
      assert.equal((await list('&academic_year=2025-2026')).length, 0);
      for (const context of contexts) for (const query of [`&plan_id=${context.plan_id}`, `&planning_request_id=${context.request_id}`]) {
        const rows = await list(query); assert.equal(rows.length, 3);
        assert.ok(rows.every(row => row.available_for_planning_term === (context.academic_year === '2026-2027')));
        assert.ok(rows.every(row => row.grading_type === 'LETTER_GRADED'));
        for (const row of rows) assert.deepEqual(row.available_semesters, [1, 2].map(semester => ({ academic_year: '2026-2027', semester })));
      }
      for (const code of newCodes) {
        const expected = seeds.flatMap(seed => normalizeSnapshot(seed).filter(c => c.course_code === code)
          .flatMap(c => c.indexes.map(index => ({ ...index, semester: seed.semester }))));
        const detail = await get('/' + code);
        assert.deepEqual(detail.indexes.map(i => [i.index_no, i.semester]).sort(), expected.map(i => [i.index, i.semester]).sort());
        for (const index of expected) {
          const slots = await get(`/${code}/indexes/${index.index}/timetable`);
          const fields = ['class_type', 'class_group', 'day_of_week', 'start_time', 'end_time', 'venue', 'teaching_weeks'];
          assert.ok(slots.every(slot => slot.teaching_weeks));
          assert.deepEqual(slots.map(row => JSON.stringify(fields.map(f => row[f]))).sort(), index.slots.map(JSON.stringify).sort());
        }
      }
      assert.deepEqual(await capture(allTables), after);
    } finally { await new Promise(resolve => apiServer.close(resolve)); }
  });
});
