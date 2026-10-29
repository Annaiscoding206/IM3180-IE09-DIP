const pool = require('../config/db');
const { PlanningError } = require('./planningError');

function contextId(value, name) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new PlanningError(400, `${name} must be a positive integer`);
  }
  return Number(value);
}

function contextQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some(k => !['plan_id', 'request_id'].includes(k))) {
    throw new PlanningError(400, 'Only plan_id and request_id are accepted');
  }
  const plan_id = query.plan_id === undefined ? null : contextId(query.plan_id, 'plan_id');
  const request_id = query.request_id === undefined ? null : contextId(query.request_id, 'request_id');
  if (request_id !== null && plan_id === null) {
    throw new PlanningError(400, 'Specify plan_id for independent-plan context', { code: 'PLAN_ID_REQUIRED' });
  }
  return { plan_id, request_id };
}

// Read-only. Callers may supply their transaction to keep ownership, selections,
// academic records and eligibility in a single consistent snapshot.
async function resolvePlanContext(studentId, query = {}, db = pool) {
  if (typeof studentId !== 'string' || !studentId.trim()) throw new PlanningError(401, 'Student identity required');
  const { plan_id, request_id } = contextQuery(query);
  if (plan_id === null) return {
    scope: 'ACADEMIC_ONLY', plan_id: null, plan_name: null, plan_status: null,
    request_id: null, academic_year: null, semester: null,
    selection_source: null, selected_course_codes: [],
  };
  const [rows] = await db.query(`SELECT p.plan_id, p.plan_name, p.status AS plan_status,
    p.request_id, pr.academic_year, pr.semester
    FROM plan p JOIN planning_request pr ON pr.request_id = p.request_id
    WHERE p.plan_id = ? AND pr.student_id = ?`, [plan_id, studentId.trim()]);
  const plan = rows[0];
  if (!plan || (request_id !== null && Number(plan.request_id) !== request_id)) {
    throw new PlanningError(404, 'Plan not found for this student and request');
  }
  if (plan.plan_status === 'ARCHIVED') throw new PlanningError(409, 'Archived plans are not current planning context', { code: 'PLAN_ARCHIVED' });
  const [selected] = await db.query('SELECT course_code FROM plan_selected_course WHERE plan_id = ? ORDER BY course_code', [plan_id]);
  return { scope: 'EXPLICIT_PLAN', ...plan, selection_source: 'plan_selected_course',
    selected_course_codes: selected.map(r => r.course_code) };
}

async function contextSnapshot(work) {
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

module.exports = { resolvePlanContext, contextQuery, contextId, contextSnapshot };
