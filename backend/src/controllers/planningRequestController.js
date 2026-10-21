const plans = require("../services/planService");

const handle = (action, status = 200) => async (req, res) => {
  try {
    const data = await action(req, res);
    return res.status(status).json({ success: true, ...(Array.isArray(data) ? { count: data.length } : {}), data });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    }
    console.error("Planning request error:", error);
    return res.status(500).json({ success: false, message: "Planning request operation failed" });
  }
};

module.exports = {
  getActivePlan: handle((req, res) => require("../services/planningSummaryService").getActivePlan(req.params.requestId, res.locals.authenticatedStudentId)),
  createPlanningRequest: handle((req) => plans.createRequest(req.body || {}), 201),
  listPlanningRequests: handle((req) => plans.listRequests(req.query.student_id)),
  getPlanningRequest: handle((req) => plans.getRequest(req.params.requestId)),

  updateTargetAu: handle((req, res) =>
    plans.updateTargetAu(
      req.params.requestId,
      res.locals.authenticatedStudentId,
      req.body || {}
    )
  ),

  createPlan: handle((req) => plans.createPlan(req.params.requestId, req.body || {}), 201),
  listPlans: handle((req) => plans.listPlanDetails(req.params.requestId)),
};
