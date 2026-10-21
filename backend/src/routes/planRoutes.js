const express = require("express");

const {
  getSelectedCourses,
  addSelectedCourse,
  removeSelectedCourse,
  getPlanTimetable,
  getPlan,
  getPlanIndexes,
  putPlanIndex,
  removePlanIndex,
  getPlanClashes,
  previewPlanIndex,
  getPlanEligibility,
  getPlanValidation,
  selectPlan
} = require("../controllers/planController");

const router = express.Router();
const { planningIdentity } = require("../middleware/planningIdentity");
const { requestOwner, planOwner } = require("../middleware/planningOwnership");
router.use(planningIdentity);
router.param("requestId", requestOwner);
router.param("planId", planOwner);
const { getIndexAlternatives } = require("../controllers/alternativeIndexController");
router.get("/:planId/indexes/:courseCode/alternatives", getIndexAlternatives);

router.get("/:planId", getPlan);
router.get("/:planId/indexes", getPlanIndexes);
router.put("/:planId/indexes/:courseCode", putPlanIndex);
router.delete("/:planId/indexes/:courseCode", removePlanIndex);
router.get("/:planId/clashes", getPlanClashes);
router.get("/:planId/eligibility", getPlanEligibility);
router.post("/:planId/select", selectPlan);
router.get("/:planId/validation", getPlanValidation);
router.post("/:planId/clash-check", previewPlanIndex);

// GET /api/plans/:requestId/courses
router.get("/:requestId/courses", getSelectedCourses);
// POST /api/plans/:requestId/courses
router.post("/:requestId/courses", addSelectedCourse);
// DELETE /api/plans/:requestId/courses/:courseCode
router.delete("/:requestId/courses/:courseCode", removeSelectedCourse);

router.get(
    "/:planId/timetable",
    getPlanTimetable
);
module.exports = router;
