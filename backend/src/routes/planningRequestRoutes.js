const express = require("express");
const {
  createPlanningRequest, listPlanningRequests, getPlanningRequest, createPlan, listPlans,
} = require("../controllers/planningRequestController");

const router = express.Router();
router.post("/", createPlanningRequest);
router.get("/", listPlanningRequests);
router.get("/:requestId", getPlanningRequest);
router.post("/:requestId/plans", createPlan);
router.get("/:requestId/plans", listPlans);

module.exports = router;
