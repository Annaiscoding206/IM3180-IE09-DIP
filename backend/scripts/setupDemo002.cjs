// From backend: node scripts/setupDemo002.cjs
// Existing schema only. One transaction for student, curriculum and attempts.
const path = require('node:path');
const assert = require('node:assert/strict');
const seed = require('../../database/demo002_profile.json');
const { seedDemoCurriculum } = require('./setupCurriculum.cjs');

async function setupDemo002(pool, definition = seed) {
  // Load the pool-backed service only after the CLI has loaded its environment.
  const { validateDemoRecord, readRecords, importDemoRecords } = require('../src/services/degreeAuditService');
  const { student, curriculum, records } = definition;
  assert.notEqual(student.student_id, 'DEMO001');
  assert.notEqual(curriculum.curriculum_key, 'DEMO_IEM_2024_DIRECT_V1');
  assert.equal(definition.student_id, student.student_id);
  for (const field of ['programme', 'admission_year', 'admission_route']) assert.equal(student[field], curriculum[field]);
  const normalized = records.map(validateDemoRecord);
  assert.equal(normalized.length, 12);
  assert.equal(new Set(normalized.map(r => r.course_code)).size, 12);
  assert.equal(normalized.reduce((sum, r) => sum + r.earned_au, 0), 28);
  assert.ok(normalized.every(r => r.result === 'PASSED' && r.grade === null && r.academic_year === '2025-2026'));
  const db = await pool.getConnection();
  let locked = false;
  const lock = `demo-profile:${student.student_id}`;
  try {
    const [[result]] = await db.query('SELECT GET_LOCK(?, 10) AS acquired', [lock]);
    if (Number(result.acquired) !== 1) throw new Error('Demo profile setup is already running');
    locked = true;
    await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await db.beginTransaction();
    const columns = ['student_id', 'student_name', 'programme', 'study_year', 'admission_year', 'admission_route'];
    const [existing] = await db.query(`SELECT ${columns.join(', ')} FROM student WHERE student_id = ? FOR UPDATE`, [student.student_id]);
    if (existing.length && columns.some(k => existing[0][k] !== student[k])) {
      throw new Error('Existing demo student differs; refusing to overwrite it');
    }
    if (!existing.length) await db.query(`INSERT INTO student (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map(k => student[k]));

    // Refuse ambiguous exact/wildcard definitions instead of changing another curriculum.
    const [matches] = await db.query(`SELECT curriculum_key FROM programme_curriculum
      WHERE programme = ? AND admission_year = ? AND (admission_route = ? OR admission_route IS NULL)`,
    [student.programme, student.admission_year, student.admission_route]);
    if (matches.some(c => c.curriculum_key !== curriculum.curriculum_key)) throw new Error('Another curriculum matches this cohort; refusing an ambiguous setup');

    // The general academic importer supports corrections. This setup does not:
    // refuse conflicting history or an alternative source key for a seeded course.
    const prior = await readRecords(student.student_id, db);
    for (const record of normalized) {
      const related = prior.filter(r => r.course_code.toUpperCase() === record.course_code || r.source_key.toLowerCase() === record.source_key.toLowerCase());
      if (related.length && (related.length !== 1 || related[0].source !== 'DEMO' ||
          Object.keys(record).some(k => related[0][k] !== record[k]))) {
        throw new Error(`Existing academic history differs for ${record.course_code}; refusing to overwrite it`);
      }
    }
    const curriculumResult = await seedDemoCurriculum(pool, definition, db);
    const auditResult = await importDemoRecords(student.student_id, records, db);
    await db.commit();
    return { student_id: student.student_id, created_student: !existing.length,
      curriculum: curriculumResult, academic: auditResult };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    try { if (locked) await db.query('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const pool = require('../src/config/db');
  (async () => {
    if (process.env.DB_NAME !== 'stars_companion_db') throw new Error('Expected local stars_companion_db');
    if (process.argv.length !== 2) throw new Error('This command takes no arguments');
    console.log(JSON.stringify(await setupDemo002(pool), null, 2));
  })().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}

module.exports = { setupDemo002 };
