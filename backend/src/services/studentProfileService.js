const { transaction, PlanningError } = require("./planService");
const { invalidateRequestPlans } = require("./planInvalidationService");

const fields = ["programme", "study_year", "admission_year", "admission_route"];
function validateChanges(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length ||
      Object.keys(changes).some(k => !fields.includes(k))) throw new PlanningError(400, "Only academic profile fields can be updated");
  for (const [key, value] of Object.entries(changes)) {
    if (key === "study_year" && (!Number.isInteger(value) || value < 1 || value > 6)) throw new PlanningError(400, "study_year must be 1–6");
    if (key === "admission_year" && value !== null && (!Number.isInteger(value) || value < 1900 || value > 2200)) throw new PlanningError(400, "Invalid admission_year");
    if ((key === "programme" || (key === "admission_route" && value !== null)) &&
        (typeof value !== "string" || !value.trim() || value.length > 50)) throw new PlanningError(400, `Invalid ${key}`);
  }
  return Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
}

// Internal setup/import helper, not a public profile editing endpoint. Caller
// holds the student and all affected request locks before updating/invalidation.
async function writeAcademicProfile(db, student, changes) {
  const values = validateChanges(changes);
  const changed = Object.keys(values).filter(k => student[k] !== values[k]);
  if (!changed.length) return false;
  await db.query(`UPDATE student SET ${changed.map(k => `${k} = ?`).join(", ")} WHERE student_id = ?`,
    [...changed.map(k => values[k]), student.student_id]);
  return true;
}
async function updateAcademicProfile(studentId, changes) {
  validateChanges(changes);
  return transaction(async db => {
    const [students] = await db.query("SELECT student_id, programme, study_year, admission_year, admission_route FROM student WHERE student_id = ? FOR UPDATE", [studentId]);
    if (!students.length) throw new PlanningError(404, "Student not found");
    const [requests] = await db.query("SELECT request_id FROM planning_request WHERE student_id = ? ORDER BY request_id FOR UPDATE", [studentId]);
    const changed = await writeAcademicProfile(db, students[0], changes);
    if (changed) for (const r of requests) await invalidateRequestPlans(db, r.request_id);
    return { student_id: students[0].student_id, changed, invalidated_request_ids: changed ? requests.map(r => r.request_id) : [] };
  });
}
module.exports = { updateAcademicProfile, writeAcademicProfile };
