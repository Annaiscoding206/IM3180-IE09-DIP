const express = require("express");

const {
  getCourses,
  getCourseByCode,
  getCourseIndexes,
  getIndexTimetable
} = require("../controllers/courseController");

const router = express.Router();
router.use(require("../middleware/planningIdentity").optionalPlanningIdentity);

// GET /api/courses
router.get("/", getCourses);

// GET /api/courses/:courseCode/indexes
router.get("/:courseCode/indexes", getCourseIndexes);

router.get(
  "/:courseCode/indexes/:indexNo/timetable",
  getIndexTimetable
);

// GET /api/courses/:courseCode
router.get("/:courseCode", getCourseByCode);


module.exports = router;
