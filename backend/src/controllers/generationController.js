const { generatePlans } = require("../services/generationService");
const { PlanningError } = require("../services/planningError");
const { EligibilityNotFoundError } = require("../services/eligibilityService");
const { explainReasons } = require("../services/planningExplanationService");

async function generate(req, res) {
  try {
    const data = await generatePlans(req.params.requestId, res.locals.authenticatedStudentId, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    if (error instanceof EligibilityNotFoundError) return res.status(422).json({ success: false,
      code: "NO_FEASIBLE_PLAN", plans: [], infeasibility_proven: false,
      ...explainReasons([{ code: "ACADEMIC_DATA_MISSING", explanation: error.message, requires_review: true }]) });
    console.error("Plan generation failed:", error);
    return res.status(500).json({ success: false, message: "Plan generation failed; no changes saved" });
  }
}
module.exports = { generate };
