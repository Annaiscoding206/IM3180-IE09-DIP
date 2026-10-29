const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { applyLegacyEarnedAu } = require('../scripts/setupDegreeAudit.cjs');
const checkedInSeed = require('../../database/09_degree_audit_demo_data.json');

test('checked-in legacy AU seed targets only the three supplied DEMO001 courses', () => {
  assert.equal(checkedInSeed.student_id, 'DEMO001');
  assert.deepEqual(checkedInSeed.legacy_earned_au, [
    { course_code: 'IE2108', earned_au: 3 },
    { course_code: 'IE2110', earned_au: 3 },
    { course_code: 'MH1810', earned_au: 3 },
  ]);
});

test('legacy earned-AU setup is scoped, atomic and repeatable over MySQL', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  assert.equal(process.env.DB_NAME, 'stars_companion_db');
  const pool = require('../src/config/db');
  const audit = require('../src/services/degreeAuditService');
  const { calculateProgress } = require('../src/services/curriculumService');
  const prefix = 'AU' + randomBytes(4).toString('hex').toUpperCase();
  const student = prefix + 'S', other = prefix + 'O';
  const seed = { ...checkedInSeed, student_id: student };
  const codes = seed.legacy_earned_au.map(row => row.course_code);
  t.after(async () => {
    try { await pool.query('DELETE FROM student WHERE student_id IN (?, ?)', [student, other]); }
    finally { await pool.end(); }
  });
  for (const owner of [student, other]) {
    await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'AU test', 'TEST', 2)", [owner]);
    for (const code of [...codes, 'OTHER']) await pool.query(`INSERT INTO academic_record
      (student_id, course_code, source, source_key, result, earned_au)
      VALUES (?, ?, 'LEGACY_COMPLETED', ?, 'PASSED', NULL)`, [owner, code, `legacy:${code}`]);
  }
  // Retain known metadata too; the correction must update only credit.
  await pool.query(`UPDATE academic_record SET course_title = 'Known title', academic_year = '2023-2024', semester = 2, grade = 'B'
    WHERE student_id = ? AND course_code = 'IE2108'`, [student]);
  await audit.importDemoRecords(student, seed.records);
  const [request] = await pool.query("INSERT INTO planning_request (student_id, academic_year, semester) VALUES (?, '2026-2027', 1)", [student]);
  const requestId = request.insertId;
  await pool.query("INSERT INTO plan (request_id, plan_name, status, rank_no, match_score) VALUES (?, 'AU unchanged', 'SELECTED', 1, 95)", [requestId]);
  const rows = () => pool.query('SELECT * FROM academic_record WHERE student_id IN (?, ?) ORDER BY record_id', [student, other]).then(([result]) => result);
  const plans = () => pool.query('SELECT * FROM plan WHERE request_id = ?', [requestId]).then(([result]) => result);
  const requests = () => pool.query('SELECT * FROM planning_request WHERE request_id = ?', [requestId]).then(([result]) => result);
  const before = await rows(), plansBefore = await plans(), requestsBefore = await requests();
  const definition = codes.map(course_code => ({ course_code, category_code: 'CORE', is_required: true }));
  const curriculum = records => calculateProgress([{ category_code: 'CORE', required_au: 9 }], [], definition, records);
  const beforeSummary = await audit.getCompletionSummary(student);
  assert.equal(beforeSummary.earned_au, 7);
  assert.equal(curriculum(await audit.readRecords(student)).summary.au_complete, false);

  await t.test('only targeted credit changes; passed status, known/unknown history, unrelated rows and plans are preserved', async () => {
    assert.equal((await applyLegacyEarnedAu(pool, seed)).changed_records, 3);
    const expected = before.map(row => row.student_id === student && codes.includes(row.course_code) && row.source === 'LEGACY_COMPLETED'
      ? { ...row, earned_au: '3.00' } : row);
    const omitUpdateTime = row => { const { updated_at, ...rest } = row; return rest; };
    assert.deepEqual((await rows()).map(omitUpdateTime), expected.map(omitUpdateTime));
    const untouched = row => !(row.student_id === student && codes.includes(row.course_code) && row.source === 'LEGACY_COMPLETED');
    assert.deepEqual((await rows()).filter(untouched), before.filter(untouched));
    assert.deepEqual(await plans(), plansBefore);
    assert.deepEqual(await requests(), requestsBefore);
    const records = await audit.readRecords(student), summary = await audit.getCompletionSummary(student);
    assert.equal(summary.earned_au, 16);
    assert.deepEqual(summary.passed_course_codes, beforeSummary.passed_course_codes);
    assert.deepEqual(summary.unknown_au_course_codes, ['OTHER'], 'Unrelated unknown credit is not filled in');
    assert.equal(summary.earned_au_complete, false);
    const progress = curriculum(records);
    assert.equal(progress.summary.completed_au, 9);
    assert.equal(progress.summary.remaining_au, 0);
    assert.equal(progress.summary.au_complete, true);
    assert.equal(progress.summary.requirements_satisfied, true);
    assert.ok(progress.courses.every(row => row.status === 'COMPLETED'));
  });

  await t.test('repeating legacy enrichment and synthetic attempt import changes nothing, including timestamps', async () => {
    const first = await rows();
    assert.equal((await applyLegacyEarnedAu(pool, seed)).changed_records, 0);
    assert.equal((await audit.importDemoRecords(student, seed.records)).changed_records, 0);
    assert.deepEqual(await rows(), first);
    assert.deepEqual(await plans(), plansBefore);
    assert.deepEqual(await requests(), requestsBefore);
  });

  await t.test('conflicting known credit rolls back earlier updates instead of overwriting history', async () => {
    await pool.query("UPDATE academic_record SET earned_au = NULL WHERE student_id = ? AND source_key = 'legacy:IE2108'", [student]);
    await pool.query("UPDATE academic_record SET earned_au = 4 WHERE student_id = ? AND source_key = 'legacy:IE2110'", [student]);
    const prior = await rows();
    await assert.rejects(applyLegacyEarnedAu(pool, seed), /Known earned AU differs/);
    assert.deepEqual(await rows(), prior);
  });

  await t.test('non-passed or missing legacy rows are rejected without changing other attempts', async () => {
    await pool.query("UPDATE academic_record SET earned_au = 0, result = 'FAILED' WHERE student_id = ? AND source_key = 'legacy:IE2110'", [student]);
    let prior = await rows();
    await assert.rejects(applyLegacyEarnedAu(pool, seed), /Expected existing legacy PASSED record/);
    assert.deepEqual(await rows(), prior);
    await pool.query("DELETE FROM academic_record WHERE student_id = ? AND source_key = 'legacy:IE2110'", [student]);
    prior = await rows();
    await assert.rejects(applyLegacyEarnedAu(pool, seed), /Expected existing legacy PASSED record/);
    assert.deepEqual(await rows(), prior);
  });
});
