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
  previewPlanIndex
} = require("../controllers/planController");

const router = express.Router();

router.get("/:planId", getPlan);
router.get("/:planId/indexes", getPlanIndexes);
router.put("/:planId/indexes/:courseCode", putPlanIndex);
router.delete("/:planId/indexes/:courseCode", removePlanIndex);
router.get("/:planId/clashes", getPlanClashes);
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
