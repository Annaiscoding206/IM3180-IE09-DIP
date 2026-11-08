// Apply only missing independent-plan extensions. Never replay base schema/seeds.
const fs = require('node:fs');
const path = require('node:path');
const statements = name => fs.readFileSync(path.resolve(__dirname, '../../database', name), 'utf8')
  .replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);

async function setupIndependentPlans(pool) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':independent-plans'), 30) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('Independent-plan migration lock unavailable');
    locked = true;
    const [tables] = await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()");
    const names = new Set(tables.map(r => r.name));
    const created = [];
    for (const sql of statements('13_independent_plans.sql')) {
      const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
      if (name && !names.has(name)) { await db.query(sql); created.push(name); }
    }
    const backfill = statements('14_independent_plan_backfill.sql');
    if (!names.has('data_migration_log')) await db.query(backfill[0]);
    await db.beginTransaction();
    const [done] = await db.query("SELECT migration_key FROM data_migration_log WHERE migration_key = '14_independent_plans_initial_copy' FOR UPDATE");
    if (done.length) {
      if (created.length) throw new Error('Backfill recorded but plan tables were missing; restore missing data before continuing');
      await db.commit();
      return { created, backfill: 'already_applied' };
    }
    const [[counts]] = await db.query('SELECT (SELECT COUNT(*) FROM plan_selected_course) + (SELECT COUNT(*) FROM plan_blocked_period) AS existing');
    if (Number(counts.existing)) throw new Error('Unlogged independent-plan data exists; refusing to replay historical selections');
    // The marker and both INSERT...SELECT copies commit together or roll back.
    for (const sql of backfill.slice(1)) {
      if (/^(START TRANSACTION|COMMIT|SELECT)\b/i.test(sql)) continue;
      await db.query(sql);
    }
    await db.commit();
    return { created, backfill: 'applied' };
  } catch (error) { await db.rollback(); throw error; }
  finally {
    if (locked) await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':independent-plans'))");
    db.release();
  }
}
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const pool = require('../src/config/db');
  setupIndependentPlans(pool).then(console.log).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { setupIndependentPlans };
