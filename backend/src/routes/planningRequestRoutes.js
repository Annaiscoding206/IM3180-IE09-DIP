const express = require("express");
const {
  createPlanningRequest, listPlanningRequests, getPlanningRequest, createPlan, listPlans,
} = require("../controllers/planningRequestController");

const router = express.Router();
const preferences = require("../controllers/preferenceController");
const { planningIdentity } = require("../middleware/planningIdentity");
router.post("/:requestId/generate-plans", planningIdentity, require("../controllers/generationController").generate);
router.get("/:requestId/preferences", planningIdentity, preferences.getPreferences);
// Full replacement: all three arrays are required; an empty array clears that
// collection. Blocked periods are managed separately and are not replaced here.
router.put("/:requestId/preferences", planningIdentity, preferences.replacePreferences);
router.get("/:requestId/blocked-periods", planningIdentity, preferences.getBlocks);
router.post("/:requestId/blocked-periods", planningIdentity, preferences.addBlock);
router.delete("/:requestId/blocked-periods/:blockId", planningIdentity, preferences.removeBlock);
router.delete("/:requestId/blocked-periods", planningIdentity, preferences.clearBlocks);
router.post("/", createPlanningRequest);
router.get("/", listPlanningRequests);
router.get("/:requestId", getPlanningRequest);
router.post("/:requestId/plans", createPlan);
router.get("/:requestId/plans", listPlans);

module.exports = router;
