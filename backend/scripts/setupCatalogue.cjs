// From backend: node scripts/setupCatalogue.cjs
// Scoped historical extension; never rerun 01/02 or replace existing rows.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const snapshot = require('../../database/catalogue/2026_1_ie2108_ie2110.json');
const snapshots = [snapshot,
  require('../../database/catalogue/2026_1_eee_foundation.json'),
  require('../../database/catalogue/2026_2_eee_foundation.json')];
const days = [null, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const types = { LEC: 'LECTURE', TUT: 'TUTORIAL', LAB: 'LAB', SEM: 'SEMINAR', STUDIO: 'STUDIO' };
const slotFields = ['class_type', 'class_group', 'day_of_week', 'start_time', 'end_time', 'venue', 'teaching_weeks'];

function normalizeSnapshot(seed) {
  assert.match(seed.academic_year, /^\d{4}-\d{4}$/);
  const year = Number(seed.academic_year.slice(0, 4));
  assert.equal(seed.academic_year, `${year}-${year + 1}`);
  assert.ok([1, 2, 3].includes(seed.semester));
  assert.equal(seed.source_semester, `${year}_${seed.semester}`);
  assert.ok(Array.isArray(seed.courses) && seed.courses.length > 0);
  const seen = new Set();
  return seed.courses.map(course => {
    assert.match(course.course_code, /^[A-Z0-9]{1,10}$/);
    assert.ok(!seen.has(course.course_code), 'Duplicate course');
    seen.add(course.course_code);
    assert.ok(typeof course.course_name === 'string' && course.course_name.length > 0 && course.course_name.length <= 255);
    assert.ok(Number.isInteger(course.au) && course.au > 0);
    assert.ok([null, 'LETTER_GRADED', 'PASS_FAIL'].includes(course.grading_type));
    assert.ok(course.course_types.every(type => ['CORE', 'MPE', 'BDE'].includes(type)));
    assert.equal(new Set(course.course_types).size, course.course_types.length);
    for (const field of ['prerequisite_text', 'restriction_text', 'mutually_exclusive_text']) {
      assert.ok(course[field] === null || typeof course[field] === 'string');
    }
    assert.ok(course.exam_datetime === null || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(course.exam_datetime));
    const indexes = Object.entries(course.indexes).map(([index, slots]) => {
      assert.match(index, /^[1-9]\d*$/);
      assert.ok(Number(index) <= 2147483647);
      assert.ok(Array.isArray(slots) && slots.length > 0);
      const normalized = slots.map(slot => {
        assert.equal(slot.key, index, 'Source slot/index mismatch');
        assert.ok(types[slot.type] && days[slot.day], 'Unsupported slot type/day; do not invent a time');
        assert.match(slot.time, /^\d{4}-\d{4}$/);
        const times = slot.time.split('-').map(time => {
          assert.ok(Number(time.slice(0, 2)) < 24 && Number(time.slice(2)) < 60);
          return `${time.slice(0, 2)}:${time.slice(2)}:00`;
        });
        assert.ok(times[1] > times[0]);
        assert.ok(typeof slot.remarks === 'string');
        // The existing clash service accepts numeric week ranges only.
        // Reject unfamiliar free text instead of silently dropping its meaning.
        const weeks = slot.remarks.replace(/^Teaching Wk/, '') || null;
        assert.ok(weeks === null || (weeks.length <= 50 && /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(weeks)));
        if (weeks) for (const part of weeks.split(',')) {
          const [first, last = first] = part.split('-').map(Number);
          assert.ok(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first > 0 && last >= first && last - first <= 1000);
        }
        assert.ok(typeof slot.group === 'string' && slot.group.length <= 20);
        assert.ok(typeof slot.venue === 'string' && slot.venue.length <= 100);
        return [types[slot.type], slot.group || null, days[slot.day], ...times, slot.venue || null, weeks];
      });
      assert.equal(new Set(normalized.map(JSON.stringify)).size, normalized.length, 'Duplicate source slot');
      return { index: Number(index), slots: normalized };
    });
    assert.ok(indexes.length > 0);
    return { ...course, indexes };
  });
}

async function ensureUnknownGrading(db) {
  const [[column]] = await db.query("SHOW COLUMNS FROM course_info LIKE 'grading_type'");
  if (!column || column.Type !== "enum('LETTER_GRADED','PASS_FAIL')") throw new Error('Unexpected grading_type schema');
  if (column.Null === 'YES') return false;
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/15_catalogue_unknown_grading.sql'), 'utf8');
  await db.query(sql);
  return true;
}

async function importCatalogue(pool, seed = snapshot) {
  const courses = normalizeSnapshot(seed); // Validate before DDL or any write.
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':catalogue-import'), 10) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('Catalogue import is already running');
    locked = true;
    // MySQL DDL implicitly commits; keep it outside the data transaction.
    const schema_changed = await ensureUnknownGrading(db);
    await db.beginTransaction();
    const result = { schema_changed, indexes_inserted: 0, slots_inserted: 0, types_inserted: 0, grading_updated: 0, teaching_weeks_updated: 0 };
    for (const course of courses) {
      for (const { index, slots } of course.indexes) {
        const fields = ['course_name', 'au', 'grading_type', 'prerequisite_text', 'restriction_text', 'mutually_exclusive_text', 'exam_datetime', 'academic_year', 'semester', 'bde', 'gepe'];
        const values = [course.course_name, course.au, course.grading_type, course.prerequisite_text, course.restriction_text, course.mutually_exclusive_text, course.exam_datetime, seed.academic_year, seed.semester, course.course_types.includes('BDE') ? 1 : 0, 0];
        const [existing] = await db.query(`SELECT course_name, au, grading_type, prerequisite_text, restriction_text, mutually_exclusive_text,
          DATE_FORMAT(exam_datetime, '%Y-%m-%d %H:%i:%s') AS exam_datetime, academic_year, semester, bde, gepe
          FROM course_info WHERE course_code = ? AND index_no = ? FOR UPDATE`, [course.course_code, index]);
        if (existing.length) {
          // Allow a snapshot to enrich unpublished grading only. Known values
          // and every other metadata/term field must still match exactly.
          const enrichGrading = existing[0].grading_type === null && course.grading_type !== null;
          const comparable = { ...existing[0], ...(enrichGrading ? { grading_type: course.grading_type } : {}) };
          // The existing PK omits term. Never overwrite an index from another term,
          // enriched metadata or availability, which could alter saved plans.
          if (JSON.stringify(fields.map(f => comparable[f])) !== JSON.stringify(values)) {
            throw new Error(`Catalogue metadata/term conflict: ${course.course_code}/${index}; existing row preserved`);
          }
          if (enrichGrading) {
            await db.query(`UPDATE course_info SET grading_type = ?
              WHERE course_code = ? AND index_no = ? AND academic_year = ? AND semester = ? AND grading_type IS NULL`,
            [course.grading_type, course.course_code, index, seed.academic_year, seed.semester]);
            result.grading_updated++;
          }
        } else {
          await db.query(`INSERT INTO course_info (course_code, index_no, ${fields.join(', ')}) VALUES (${Array(13).fill('?').join(', ')})`, [course.course_code, index, ...values]);
          result.indexes_inserted++;
        }
        const [existingSlots] = await db.query(`SELECT slot_id, ${slotFields.join(', ')} FROM class_slots WHERE course_code = ? AND index_no = ? FOR UPDATE`, [course.course_code, index]);
        // Enrich only unspecified weeks on an otherwise identical, unambiguous
        // slot. Explicit weeks, slot IDs, times and venues must never be replaced.
        for (const row of existingSlots) {
          if (row.teaching_weeks !== null && row.teaching_weeks !== '') continue;
          const identity = JSON.stringify(slotFields.slice(0, -1).map(f => row[f]));
          const matches = slots.filter(slot => JSON.stringify(slot.slice(0, -1)) === identity);
          if (matches.length !== 1 || matches[0][6] === null) continue;
          const [update] = await db.query(`UPDATE class_slots SET teaching_weeks = ?
            WHERE slot_id = ? AND (teaching_weeks IS NULL OR teaching_weeks = '')`, [matches[0][6], row.slot_id]);
          result.teaching_weeks_updated += update.affectedRows;
          row.teaching_weeks = matches[0][6];
        }
        const expected = new Set(slots.map(JSON.stringify));
        const present = existingSlots.map(row => JSON.stringify(slotFields.map(f => row[f])));
        if (new Set(present).size !== present.length || present.some(key => !expected.has(key))) {
          throw new Error(`Catalogue slot conflict: ${course.course_code}/${index}; existing slots preserved`);
        }
        for (const slot of slots) {
          if (present.includes(JSON.stringify(slot))) continue;
          await db.query(`INSERT INTO class_slots (course_code, index_no, ${slotFields.join(', ')}) VALUES (${Array(9).fill('?').join(', ')})`, [course.course_code, index, ...slot]);
          result.slots_inserted++;
        }
      }
      for (const type of course.course_types) {
        const [existing] = await db.query('SELECT type_code FROM course_type WHERE course_code = ? AND type_code = ? FOR UPDATE', [course.course_code, type]);
        if (existing.length) continue;
        await db.query('INSERT INTO course_type (course_code, type_code) VALUES (?, ?)', [course.course_code, type]);
        result.types_inserted++;
      }
    }
    await db.commit();
    return result;
  } catch (error) { await db.rollback(); throw error; }
  finally {
    try { if (locked) await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':catalogue-import'))"); }
    finally { db.release(); }
  }
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const pool = require('../src/config/db');
  (async () => {
    if (process.env.DB_NAME !== 'stars_companion_db') throw new Error('Expected local stars_companion_db');
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/setupCatalogue.cjs');
    // Validate the entire explicit bundle before importing any snapshot.
    // Keep the existing per-snapshot transaction and conflict/preservation rules.
    const keys = new Set();
    for (const seed of snapshots) for (const course of normalizeSnapshot(seed)) {
      for (const { index } of course.indexes) {
        const key = `${course.course_code}/${index}`;
        assert.ok(!keys.has(key), `Duplicate course/index across snapshots: ${key}`);
        keys.add(key);
      }
    }
    for (const seed of snapshots) console.log(JSON.stringify({
      source_semester: seed.source_semester,
      courses: seed.courses.map(course => course.course_code),
      ...await importCatalogue(pool, seed)
    }, null, 2));
  })().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { importCatalogue, normalizeSnapshot, ensureUnknownGrading };
