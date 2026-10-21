const express = require("express");
const {
  createPlanningRequest, listPlanningRequests, getPlanningRequest, createPlan, listPlans,
} = require("../controllers/planningRequestController");

const router = express.Router();
const preferences = require("../controllers/preferenceController");
const { planningIdentity } = require("../middleware/planningIdentity");
const { requestOwner, studentScope } = require("../middleware/planningOwnership");
router.use(planningIdentity);
router.param("requestId", requestOwner);
router.post("/:requestId/generate-plans", require("../controllers/generationController").generate);
router.get("/:requestId/preferences", preferences.getPreferences);
// Full replacement: all three arrays are required; an empty array clears that
// collection. Blocked periods are managed separately and are not replaced here.
router.put("/:requestId/preferences", preferences.replacePreferences);
router.get("/:requestId/blocked-periods", preferences.getBlocks);
router.post("/:requestId/blocked-periods", preferences.addBlock);
router.delete("/:requestId/blocked-periods/:blockId", preferences.removeBlock);
router.delete("/:requestId/blocked-periods", preferences.clearBlocks);
router.post("/", studentScope, createPlanningRequest);
router.get("/", studentScope, listPlanningRequests);
router.get("/:requestId", getPlanningRequest);
router.post("/:requestId/plans", createPlan);
router.get("/:requestId/plans", listPlans);

module.exports = router;
