const pool = require("../config/db");
const { integer, PlanningError } = require("../services/planService");

// HTTP ownership is checked for every legacy and new planning route. Services
// remain internal trusted calls; student identity never comes from client IDs.
const owner = kind => async (req, res, next, value) => {
  try {
    const id = integer(value, kind === "plan" ? "planId" : "requestId");
    const studentId = res.locals.authenticatedStudentId;
    if (!studentId) throw new PlanningError(401, "Student identity required");
    const [rows] = await pool.query(kind === "plan"
      ? `SELECT p.plan_id FROM plan p JOIN planning_request pr ON pr.request_id = p.request_id
         WHERE p.plan_id = ? AND pr.student_id = ?`
      : "SELECT request_id FROM planning_request WHERE request_id = ? AND student_id = ?", [id, studentId]);
    if (!rows.length) throw new PlanningError(404, kind === "plan" ? "Plan not found" : "Planning request not found");
    next();
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Planning ownership check failed:", error);
    res.status(500).json({ success: false, message: "Planning ownership check failed" });
  }
};
function studentScope(req, res, next) {
  const studentId = req.method === "POST" ? req.body?.student_id : req.query.student_id;
  if (typeof studentId !== "string" || !studentId.trim()) return res.status(400).json({ success: false, message: "student_id is required" });
  if (studentId.trim().toUpperCase() !== res.locals.authenticatedStudentId.trim().toUpperCase()) {
    return res.status(404).json({ success: false, message: "Student not found for this identity" });
  }
  next();
}
module.exports = { requestOwner: owner("request"), planOwner: owner("plan"), studentScope };
