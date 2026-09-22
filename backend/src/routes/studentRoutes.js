const express = require("express");

const {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
} = require("../controllers/studentController");

const router = express.Router();

// GET /api/students
router.get("/", getAllStudents);
// GET /api/students/:studentId
router.get("/:studentId", getStudentById);
// GET /api/students/:studentId/eligibility/:courseCode
router.get(
  "/:studentId/eligibility/:courseCode",
  checkPrerequisiteEligibility
);

module.exports = router;