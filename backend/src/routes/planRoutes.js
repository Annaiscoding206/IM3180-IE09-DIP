const express = require("express");

const {
  getSelectedCourses,
} = require("../controllers/planController");

const router = express.Router();

// GET /api/plans/:requestId/courses
router.get("/:requestId/courses", getSelectedCourses);

module.exports = router;