const { getStudentCurriculum } = require("../services/curriculumService");
const { PlanningError } = require("../services/planningError");

async function getCurriculum(req, res) {
  try {
    res.status(200).json({ success: true, data: await getStudentCurriculum(req.params.studentId, res.locals.authenticatedStudentId, req.query) });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    console.error("Curriculum retrieval failed:", error);
    res.status(500).json({ success: false, message: "Curriculum retrieval failed" });
  }
}
module.exports = { getCurriculum };
