const express = require("express");

const {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
} = require("../controllers/studentController");

const router = express.Router();
const { planningIdentity } = require("../middleware/planningIdentity");
router.get("/:studentId/degree-audit", planningIdentity, require("../controllers/degreeAuditController").getStudentDegreeAudit);

router.get("/:studentId/curriculum", planningIdentity, require("../controllers/curriculumController").getCurriculum);
router.get("/:studentId/curriculum/progress", planningIdentity, require("../controllers/curriculumController").getCurriculum);

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
