const express = require("express");

const {
  getSelectedCourses,
  addSelectedCourse,
} = require("../controllers/planController");

const router = express.Router();

// GET /api/plans/:requestId/courses
router.get("/:requestId/courses", getSelectedCourses);
// POST /api/plans/:requestId/courses
router.post("/:requestId/courses", addSelectedCourse);

module.exports = router;