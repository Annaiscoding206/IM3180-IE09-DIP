const express = require("express");

const {
  getCourses,
  getCourseByCode,
  getCourseIndexes,
} = require("../controllers/courseController");

const router = express.Router();

// GET /api/courses
router.get("/", getCourses);

// GET /api/courses/:courseCode/indexes
router.get("/:courseCode/indexes", getCourseIndexes);

// GET /api/courses/:courseCode
router.get("/:courseCode", getCourseByCode);

module.exports = router;