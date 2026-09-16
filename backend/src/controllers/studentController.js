const pool = require("../config/db");

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

    res.status(200).json({
      success: true,
      data: students[0],
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

    // --------------------------------------------------
    // 1. Check that the student exists
    // --------------------------------------------------
    const [students] = await pool.query(
      `
      SELECT
        student_id,
        programme
      FROM student
      WHERE student_id = ?
      LIMIT 1
      `,
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const studentProgramme = students[0].programme;


    // --------------------------------------------------
    // 2. Get prerequisite requirements for the course
    // --------------------------------------------------
    const [requirements] = await pool.query(
      `
      SELECT
        required_course_code,
        requirement_group
      FROM course_requirement
      WHERE course_code = ?
      AND requirement_type = 'PREREQUISITE'
      ORDER BY requirement_group
      `,
      [courseCode]
    );


    // --------------------------------------------------
    // 3. Get courses completed by the student
    // --------------------------------------------------
    const [completedCourses] = await pool.query(
      `
      SELECT course_code
      FROM completed_course
      WHERE student_id = ?
      `,
      [studentId]
    );

    const completedCourseCodes = completedCourses.map(
      (course) => course.course_code
    );


    // --------------------------------------------------
    // 4. Check prerequisite eligibility
    // --------------------------------------------------
    // No prerequisites = automatically satisfies
    // prerequisite requirement.
    //
    // For the current demo data, courses in the same
    // requirement group represent OR alternatives.
    const prerequisiteEligible =
      requirements.length === 0 ||
      requirements.some((requirement) =>
        completedCourseCodes.includes(
          requirement.required_course_code
        )
      );


    // --------------------------------------------------
    // 5. Check programme restrictions
    // --------------------------------------------------
    const [programmeRestrictions] = await pool.query(
      `
      SELECT
        programme,
        restriction_type
      FROM programme_restriction
      WHERE course_code = ?
      AND programme = ?
      `,
      [courseCode, studentProgramme]
    );

    const programmeEligible = !programmeRestrictions.some(
      (restriction) =>
        restriction.restriction_type === "NOT_AVAILABLE"
    );


    // --------------------------------------------------
    // 6. Overall eligibility
    // --------------------------------------------------
    const overallEligible =
      prerequisiteEligible && programmeEligible;


    // --------------------------------------------------
    // 7. Return result
    // --------------------------------------------------
    res.status(200).json({
      success: true,
      prerequisite_eligible: prerequisiteEligible,
      programme_eligible: programmeEligible,
      eligible: overallEligible,
      prerequisites: requirements,
      completed_courses: completedCourseCodes,
      programme_restrictions: programmeRestrictions,
    });

  } catch (error) {
    console.error("Error checking prerequisites:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check prerequisites",
    });
  }
};


module.exports = {
  getStudentById,
  checkPrerequisiteEligibility,
};