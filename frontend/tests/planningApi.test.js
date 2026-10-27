import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.js";

// Exercise the browser adapter's real endpoint/envelope contract without a
// running model, Telegram bot or shared demo-data mutation.
test("Planner adapters persist/reload preferences and day-specific blocks", async t => {
  const calls = [];
  const data = { day_preferences: [], time_preferences: [], objectives: [] };
  let blocks = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("/preferences")) return Response.json({ success: true, data });
    if (options.method === "POST") blocks = [{ block_id: 7, ...JSON.parse(options.body) }];
    if (options.method === "DELETE") blocks = [];
    return Response.json({ success: true, data: { blocked_periods: blocks } });
  });
  assert.deepEqual(await api.savePreferences(42, data), data);
  assert.deepEqual(await api.preferences(42), data);
  await api.addBlock(42, { day_of_week: "MON", start_time: "09:30", end_time: "10:20" });
  assert.equal((await api.blocks(42))[0].start_time, "09:30");
  await api.removeBlock(42, 7); assert.deepEqual(await api.blocks(42), []);
  await api.clearBlocks(42);
  assert.equal(calls[0][0], "/api/planning-requests/42/preferences");
  assert.equal(calls[0][1].method, "PUT"); assert.equal(calls[0][1].body, JSON.stringify(data));
  assert.equal(calls[4][0], "/api/planning-requests/42/blocked-periods/7");
});

test("Generate uses request ID and explicit source plan; summaries and selection use plan ID", async t => {
  const calls = [], plan = { plan_id: 99, label: "Plan A", indexes: [{ course_code: "IE3014", index_no: 1 }], sessions: [], rank_no: 1, match_score: 100, metrics: { campus_days: 1 }, validation: { can_finalize: true } };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    const data = url.endsWith("generate-plans") ? { plans: [plan] } : url.endsWith("active-plan") ? { plan: { ...plan, active_selection: true } } : plan;
    return Response.json({ success: true, data });
  });
  assert.equal((await api.generatePlans(42, 99)).plans[0].label, "Plan A");
  assert.deepEqual(JSON.parse(calls[0][1].body), { source_plan_id: 99 });
  assert.equal(calls[0][0], "/api/planning-requests/42/generate-plans");
  assert.equal((await api.planSummary(99)).validation.can_finalize, true);
  await api.selectPlan(99); assert.equal(calls[2][0], "/api/plans/99/select");
  assert.equal((await api.activePlan(42)).plan.plan_id, 99);
  await api.lockIndex(99, "IE3014", true);
  assert.equal(calls[4][0], "/api/plans/99/indexes/IE3014/lock"); assert.deepEqual(JSON.parse(calls[4][1].body), { locked: true });
});

test("Regenerate targets one plan directly", async t => {
  const calls = [];
  const regenerated = { plan_id: 99, indexes: [{ course_code: "IE3014", index_no: 2, locked: false }] };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    return Response.json({ success: true, data: regenerated });
  });

  assert.deepEqual(await api.regeneratePlan(99), regenerated);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/plans/99/regenerate");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].body, undefined);
});

test("structured no-plan/search-limit failures reach the UI intact", async t => {
  for (const [status, code] of [[422, "NO_FEASIBLE_PLAN"], [409, "SEARCH_LIMIT_REACHED"]]) {
    const failure = { success: false, message: "No timetable found", code, reasons: [{ code: "HARD_DAY_CONSTRAINT" }], suggestions: [{ action: "REVIEW_HARD_CONSTRAINT" }] };
    t.mock.method(globalThis, "fetch", async () => Response.json(failure, { status }));
    await assert.rejects(api.generatePlans(42, 99), e => e.status === status && e.details.code === code && e.details.suggestions.length === 1);
    t.mock.restoreAll();
  }
});

test("no active selection stays null; UI never promotes the first generated plan", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: { status: "no_active_selection", plan: null, stale_plan_ids: [99] } }));
  const result = await api.activePlan(42); assert.equal(result.plan, null); assert.deepEqual(result.stale_plan_ids, [99]);
});
