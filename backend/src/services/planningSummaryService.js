const plans = require("./planService");
const { readPreferenceSnapshot } = require("./hardConstraintService");
const { scorePlan } = require("./planRankingService");
const pool = require("../config/db");

async function requireOwnedRequest(requestId, studentId, db = pool, lock = false) {
  const id = plans.integer(requestId, "requestId");
  if (typeof studentId !== "string" || !studentId.trim()) throw new plans.PlanningError(401, "Student identity required");
  const [rows] = await db.query(`SELECT * FROM planning_request WHERE request_id = ? AND student_id = ?${lock ? " FOR UPDATE" : ""}`, [id, studentId]);
  if (!rows.length) throw new plans.PlanningError(404, "Planning request not found for this student");
  return rows[0];
}
async function summarizePlan(plan, db) {
  const detail = await plans.describePlan(plan, db);
  const indexes = await db.query("SELECT course_code, index_no, locked FROM plan_course WHERE plan_id = ? ORDER BY course_code", [plan.plan_id]).then(([rows]) => rows);
  const schedules = await plans.readSchedules(indexes, db);
  const [selectedRows] = await db.query(
    `SELECT course_code
     FROM plan_selected_course
     WHERE plan_id = ?
     ORDER BY course_code`,
    [plan.plan_id]
  );

  const snapshot = await readPreferenceSnapshot(
    db,
    plan.request_id,
    plan.plan_id
  );

  const selectedCourses = selectedRows.map(
    row => row.course_code
  );
  const sessions = schedules.flatMap(index => index.slots.map(slot => ({ ...slot, course_code: index.course_code, index_no: index.index_no })))
    .sort((a, b) => ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(a.day_of_week) - ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time) || a.slot_id - b.slot_id);
  return {
    ...detail,

    selected_courses: selectedCourses,

    blocked_periods: snapshot.blocked_periods,

    indexes,

    sessions,

    metrics:
      detail.validation.timetable.status === "incomplete" ||
      !indexes.length
        ? null
        : scorePlan(schedules, snapshot),

    metrics_scope: "current_plan_preferences",

    label:
      plan.plan_name.match(/^AUTO (Plan [ABC]) #\d+$/)?.[1] ??
      plan.plan_name
  };
}
async function getPlanSummary(planId, studentId) {
  return plans.transaction(async db => {
    const plan = await plans.getPlan(planId, db);
    await requireOwnedRequest(plan.request_id, studentId, db, true);
    return summarizePlan(await plans.getPlan(planId, db, true), db);
  });
}
async function getRequestPlanSummaries(requestId, studentId) {
  return plans.transaction(async db => {
    const request = await requireOwnedRequest(requestId, studentId, db, true);
    const [rows] = await db.query("SELECT plan_id FROM plan WHERE request_id = ? ORDER BY plan_id", [request.request_id]);
    const summaries = [];
    for (const row of rows) summaries.push(await summarizePlan(await plans.getPlan(row.plan_id, db, true), db));
    return summaries;
  });
}
async function getActivePlan(requestId, studentId) {
  const all = await getRequestPlanSummaries(requestId, studentId);
  const active = all.filter(plan => plan.active_selection);
  if (active.length > 1) throw new plans.PlanningError(409, "Multiple active selections require review", { code: "AMBIGUOUS_SELECTION" });
  return { request_id: Number(requestId), status: active.length ? "active_selection" : "no_active_selection", plan: active[0] ?? null,
    stale_plan_ids: all.filter(p => p.selection_state === "STALE_INVALID").map(p => p.plan_id) };
}
module.exports = { requireOwnedRequest, getPlanSummary, getRequestPlanSummaries, getActivePlan };
