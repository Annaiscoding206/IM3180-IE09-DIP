const { getAlternatives } = require("../services/alternativeIndexService");
const { PlanningError } = require("../services/planningError");
const { EligibilityNotFoundError } = require("../services/eligibilityService");

async function getIndexAlternatives(req, res) {
  try {
    const data = await getAlternatives(req.params.planId, req.params.courseCode, res.locals.authenticatedStudentId, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    if (error instanceof EligibilityNotFoundError) return res.status(422).json({ success: false, message: error.message, code: "ACADEMIC_DATA_MISSING" });
    console.error("Alternative index validation failed:", error);
    return res.status(500).json({ success: false, message: "Alternative index validation failed" });
  }
}
module.exports = { getIndexAlternatives };
