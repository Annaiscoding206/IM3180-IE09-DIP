const express = require("express");

const {
  getSelectedCourses,
  addSelectedCourse,
  removeSelectedCourse,
  getPlanTimetable
} = require("../controllers/planController");

const router = express.Router();

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