const express = require("express");

const {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
} = require("../controllers/studentController");

const router = express.Router();

const { planningIdentity } = require("../middleware/planningIdentity");

// Require an authenticated student for every student API.
router.use(planningIdentity);

// Ensure the requested student matches the authenticated identity.
router.param("studentId", (req, res, next, studentId) => {
  const authenticatedStudentId = res.locals.authenticatedStudentId;

  if (
    studentId.trim().toUpperCase() !==
    authenticatedStudentId.trim().toUpperCase()
  ) {
    return res.status(404).json({
      success: false,
      message: "Student not found for this identity"
    });
  }

  next();
});

// Degree Audit
router.get(
  "/:studentId/degree-audit",
  require("../controllers/degreeAuditController").getStudentDegreeAudit
);

// Programme Curriculum
router.get(
  "/:studentId/curriculum",
  require("../controllers/curriculumController").getCurriculum
);

router.get(
  "/:studentId/curriculum/progress",
  require("../controllers/curriculumController").getCurriculum
);

// Student Profile
router.get("/", getAllStudents);
router.get("/:studentId", getStudentById);

// Course Eligibility
router.get(
  "/:studentId/eligibility/:courseCode",
  checkPrerequisiteEligibility
);

module.exports = router;