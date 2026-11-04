const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupTeachingWeeks } = require('../scripts/setupTeachingWeeks.cjs');

const source = name => fs.readFileSync(path.resolve(__dirname, '../../database', name), 'utf8');
const slotInserts = sql => sql.match(/INSERT\s+INTO\s+`?class_slots`?\s[\s\S]*?;/gi);

test('legacy teaching-week setup preserves explicit weeks and all other columns; seeds supply defaults',
  { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async () => {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
    const pool = require('../src/config/db');
    const db = await pool.getConnection();
    try {
      // Connection-local shadow table: no permanent catalogue or planning data is touched.
      await db.query('CREATE TEMPORARY TABLE teaching_weeks_template LIKE class_slots');
      await db.query('CREATE TEMPORARY TABLE class_slots LIKE teaching_weeks_template');
      await db.query(slotInserts(source('02_course_data.sql'))[0]);
      const rows = async () => (await db.query('SELECT * FROM class_slots ORDER BY slot_id'))[0];
      const seedRows = await rows();
      assert.equal(seedRows.length, 172);
      assert.ok(seedRows.every(row => row.teaching_weeks === '1-13'));
      assert.equal(seedRows.filter(row => row.course_code === 'CS2024' && row.index_no === 32601).length, 2);

      for (const [i, weeks] of [null, '', '   ', '1-12', '6,12', '10'].entries()) {
        await db.query('UPDATE class_slots SET teaching_weeks = ? WHERE slot_id = ?', [weeks, seedRows[i].slot_id]);
      }
      const before = await rows();
      assert.deepEqual(await setupTeachingWeeks(db), { teaching_weeks_updated: 3 });
      const expected = before.map(row => ({ ...row, teaching_weeks:
        row.teaching_weeks === null || row.teaching_weeks.trim() === '' ? '1-13' : row.teaching_weeks }));
      assert.deepEqual(await rows(), expected);
      assert.deepEqual(await setupTeachingWeeks(db), { teaching_weeks_updated: 0 });
      assert.deepEqual(await rows(), expected);

      // Validate the actual historical and optional seed INSERT syntax in isolation.
      await db.query('DELETE FROM class_slots');
      for (const sql of slotInserts(source('03_demo_data.sql'))) await db.query(sql);
      assert.equal((await rows()).length, 3);
      assert.ok((await rows()).every(row => row.teaching_weeks === '1-13'));
      await db.query('DELETE FROM class_slots');
      await db.query('SET @add_mh1811_demo_slots = 1');
      for (const sql of slotInserts(source('04_week8_demo_data.sql'))) await db.query(sql);
      assert.equal((await rows()).length, 2);
      assert.ok((await rows()).every(row => row.teaching_weeks === '1-13'));
      assert.match(source('migrate_course_data.sql'), /'1-13' AS teaching_weeks/);
    } finally {
      await db.query('DROP TEMPORARY TABLE IF EXISTS class_slots');
      await db.query('DROP TEMPORARY TABLE IF EXISTS teaching_weeks_template');
      db.release();
      await pool.end();
    }
  });
