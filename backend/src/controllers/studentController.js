const { resolvePlanContext, contextSnapshot } = require("../services/planContextService");
const { PlanningError } = require("../services/planningError");
const { getCurriculumOverview } = require("../services/curriculumService");
const pool = require("../config/db");
const { evaluateEligibility, EligibilityNotFoundError } = require("../services/eligibilityService");
const { getCompletionSummary } = require("../services/degreeAuditService");

// GET /api/students
// GET /api/students
// Return only the authenticated student's profile.
const getAllStudents = async (req, res) => {
  try {
    const studentId = res.locals.authenticatedStudentId;

    const [students] = await pool.query(
      `
      SELECT
        student_id,
        student_name,
        programme,
        study_year,
        admission_year,
        admission_route,
        created_at
      FROM student
      WHERE student_id = ?
      `,
      [studentId]
    );

    res.status(200).json({
      success: true,
      data: students,
    });

  } catch (error) {
    console.error("Error fetching students:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch students",
    });
  }
};

// GET /api/students/:studentId
const getStudentById = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [students] = await pool.query(
      `
      SELECT
        student_id,
        student_name,
        programme,
        study_year,
        admission_year,
        admission_route,
        created_at
      FROM student
      WHERE student_id = ?
      `,
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const audit = await getCompletionSummary(studentId);

    res.status(200).json({
      success: true,
      data: {
        ...students[0],
        completed_courses: audit.passed_course_codes,
        degree_audit_summary: audit,
        curriculum_progress: await getCurriculumOverview(studentId),
      },
    });
  } catch (error) {
    console.error("Error fetching student:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student",
    });
  }
};


// GET /api/students/:studentId/eligibility/:courseCode
const checkPrerequisiteEligibility = async (req, res) => {
  try {
    const { studentId, courseCode } = req.params;
    const result = await contextSnapshot(async db => {
      const context = await resolvePlanContext(res.locals.authenticatedStudentId, req.query, db);
      const eligibility = await evaluateEligibility(studentId, courseCode, db,
        context.request_id, context.selected_course_codes);
      return { ...eligibility, planning_context: context };
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    if (error instanceof EligibilityNotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("Error checking eligibility:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports = {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
};
