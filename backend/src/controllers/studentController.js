const pool = require("../config/db");
const { evaluateEligibility, EligibilityNotFoundError } = require("../services/eligibilityService");

// GET /api/students
const getAllStudents = async (req, res) => {
  try {
    const [students] = await pool.query(
      `
      SELECT
        student_id,
        student_name,
        programme,
        study_year,
        created_at
      FROM student
      `
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

    const [completedCourses] = await pool.query(
      `
      SELECT course_code
      FROM completed_course
      WHERE student_id = ?
      ORDER BY course_code
      `,
      [studentId]
    );
	
	const [auditEntries] = await pool.query(
      `
      SELECT course_code, course_title, taken_year,
	  taken_semester, au, grade
      FROM demo_degree_audit
      WHERE student_id = ?
      ORDER BY taken_year, taken_semester`,
      [studentId]
    );
	
	const [curriculumRows] = await pool.query(
      `
      SELECT programme, course_code, course_name, course_year, 
	  course_semester, type_code, au, prerequisite_note
      FROM demo_IEM_curriculum
      WHERE programme = ?
      ORDER BY course_year, course_semester, course_code`,
      [students[0].programme]
    );

    res.status(200).json({
      success: true,
      data: {
        ...students[0],
        completed_courses: completedCourses.map((row) => row.course_code),
		degree_audit: auditEntries,
		programme_curriculum: curriculumRows,
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
    const rawRequestId = req.query.request_id;
let requestId = null;

if (rawRequestId !== undefined) {
  if (
    typeof rawRequestId !== "string" ||
    !/^[1-9]\d*$/.test(rawRequestId) ||
    !Number.isSafeInteger(Number(rawRequestId)) ||
    Number(rawRequestId) > 2147483647
  ) {
    return res.status(400).json({
      success: false,
      message: "request_id must be a positive integer",
    });
  }

  requestId = Number(rawRequestId);
}

const eligibility = await evaluateEligibility(
  studentId,
  courseCode,
  pool,
  requestId
);
    return res.status(200).json({ success: true, ...eligibility });
  } catch (error) {
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
