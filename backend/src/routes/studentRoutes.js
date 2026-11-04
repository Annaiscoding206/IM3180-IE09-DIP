const express = require("express");

const {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
} = require("../controllers/studentController");

const router = express.Router();

const { planningIdentity, switchDemoStudentId } = require("../middleware/planningIdentity");

// Require an authenticated student for every student API.
router.use(planningIdentity);

// Bootstrap identity comes only from trusted middleware, never a client selector.
// Register before /:studentId so "current" is not interpreted as an ID.
router.get("/current", (req, res) => res.set("Cache-Control", "no-store").json({
  success: true, data: { student_id: res.locals.authenticatedStudentId,
    demo_switch_enabled: res.locals.isLocalDemoPlanning === true }
}));

router.post("/current", async (req, res) => {
  res.set("Cache-Control", "no-store");
  // Trusted production authentication must never enable this demo-only action.
  if (res.locals.isLocalDemoPlanning !== true) return res.status(403).json({
    success: false, code: "DEMO_SWITCH_DISABLED", message: "Profile switching is available only in local demo planning mode"
  });
  try {
    const student_id = await switchDemoStudentId(req.body?.student_id);
    return res.json({ success: true, data: { student_id, demo_switch_enabled: true } });
  } catch (error) {
    return res.status(error.status || 503).json({ success: false,
      code: error.details?.code || "DEMO_IDENTITY_UNAVAILABLE",
      message: error.status ? error.message : "Active demo student is unavailable; check server configuration and student setup" });
  }
});

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
