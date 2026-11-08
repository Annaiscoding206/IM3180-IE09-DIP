// From backend: node scripts/setupTeachingWeeks.cjs
// Existing installations: fill unspecified weeks without replaying historical seeds.
const path = require('node:path');

async function setupTeachingWeeks(db) {
  // One atomic, repeatable update; explicit ranges and every other column stay intact.
  const [result] = await db.query(`UPDATE class_slots SET teaching_weeks = '1-13'
    WHERE teaching_weeks IS NULL OR TRIM(teaching_weeks) = ''`);
  return { teaching_weeks_updated: result.affectedRows };
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const pool = require('../src/config/db');
  (async () => {
    if (process.env.DB_NAME !== 'stars_companion_db') throw new Error('Expected local stars_companion_db');
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/setupTeachingWeeks.cjs');
    console.log(JSON.stringify(await setupTeachingWeeks(pool), null, 2));
  })().catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { setupTeachingWeeks };
