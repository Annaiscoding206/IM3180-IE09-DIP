const { getDegreeAudit } = require("../services/degreeAuditService");
const { PlanningError } = require("../services/planningError");

async function getStudentDegreeAudit(req, res) {
  try {
    return res.status(200).json({ success: true,
      data: await getDegreeAudit(req.params.studentId, res.locals.authenticatedStudentId, req.query) });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Degree Audit retrieval failed:", error);
    return res.status(500).json({ success: false, message: "Degree Audit retrieval failed" });
  }
}
module.exports = { getStudentDegreeAudit };
