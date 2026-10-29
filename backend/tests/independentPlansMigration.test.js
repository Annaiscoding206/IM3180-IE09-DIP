const test = require('node:test');
const assert = require('node:assert/strict');
const { setupIndependentPlans } = require('../scripts/setupIndependentPlans.cjs');

function database({ existing = 0, failBlocks = false } = {}) {
  const state = { tables: [], marker: false, courses: existing, blocks: 0 };
  let snapshot;
  const db = {
    async query(sql) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('information_schema.tables')) return [state.tables.map(name => ({ name }))];
      const table = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
      if (table) { state.tables.push(table); return [[]]; }
      if (sql.startsWith('SELECT migration_key')) return [state.marker ? [{ migration_key: '14_independent_plans_initial_copy' }] : []];
      if (sql.includes('AS existing')) return [[{ existing: state.courses + state.blocks }]];
      if (sql.startsWith('INSERT INTO data_migration_log')) { state.marker = true; return [[]]; }
      if (sql.startsWith('INSERT INTO plan_selected_course')) { state.courses += 3; return [[]]; }
      if (sql.startsWith('INSERT INTO plan_blocked_period')) {
        if (failBlocks) throw Error('Injected block-copy failure');
        state.blocks += 2;
        return [[]];
      }
      throw Error(`Unexpected migration SQL: ${sql}`);
    },
    async beginTransaction() { snapshot = structuredClone(state); },
    async commit() { snapshot = null; },
    async rollback() { if (snapshot) Object.assign(state, snapshot); snapshot = null; },
    release() {},
  };
  return { state, getConnection: async () => db };
}

test('missing extensions are applied once; reruns preserve subsequent independent edits', async () => {
  const db = database();
  assert.deepEqual(await setupIndependentPlans(db), {
    created: ['plan_selected_course', 'plan_blocked_period'], backfill: 'applied',
  });
  assert.equal(db.state.courses, 3);
  assert.equal(db.state.blocks, 2);
  db.state.courses = 1;
  db.state.blocks = 0;
  const before = structuredClone(db.state);
  assert.deepEqual(await setupIndependentPlans(db), { created: [], backfill: 'already_applied' });
  assert.deepEqual(db.state, before);
});

test('backfill marker and copies roll back together on failure', async () => {
  const db = database({ failBlocks: true });
  await assert.rejects(setupIndependentPlans(db), /Injected block-copy failure/);
  assert.equal(db.state.marker, false);
  assert.equal(db.state.courses, 0);
  assert.equal(db.state.blocks, 0);
  assert.ok(db.state.tables.includes('plan_selected_course'), 'DDL persists outside transaction');
});

test('unlogged independent data is never overwritten by historical backfill', async () => {
  const db = database({ existing: 1 });
  await assert.rejects(setupIndependentPlans(db), /Unlogged independent-plan data/);
  assert.equal(db.state.courses, 1);
  assert.equal(db.state.marker, false);
});

test('recorded backfill with missing tables requires recovery', async () => {
  const db = database();
  db.state.marker = true;
  await assert.rejects(setupIndependentPlans(db), /Backfill recorded but plan tables were missing/);
});
