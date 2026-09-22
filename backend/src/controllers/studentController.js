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
};const pool = require("../config/db");

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

    const { studentId, courseCode } = req.params;

    try {

        // 1. Get required prerequisite courses
        const prerequisiteQuery = `
            SELECT required_course_code
            FROM course_requirement
            WHERE course_code = ?
            AND requirement_type = 'PREREQUISITE'
        `;

        const [requirements] = await pool.query(
            prerequisiteQuery,
            [courseCode]
        );


        // No prerequisite required
        if (requirements.length === 0) {

            return res.json({
                success: true,
                student_id: studentId,
                course_code: courseCode,
                eligible: true,
                message: "No prerequisite required"
            });

        }


        // 2. Get student's completed courses
        const completedQuery = `
            SELECT course_code
            FROM completed_course
            WHERE student_id = ?
        `;


        const [completedCourses] = await pool.query(
            completedQuery,
            [studentId]
        );


        const completed = completedCourses.map(
            c => c.course_code
        );


        // 3. Find missing prerequisites
        const missing = requirements
            .map(r => r.required_course_code)
            .filter(reqCourse => 
                !completed.includes(reqCourse)
            );


        // 4. Return result

        if (missing.length === 0) {

            return res.json({
                success:true,
                student_id:studentId,
                course_code:courseCode,
                eligible:true,
                message:"All prerequisites satisfied"
            });

        }


        else {

            return res.json({
                success:true,
                student_id:studentId,
                course_code:courseCode,
                eligible:false,
                missing_prerequisites:missing,
                message:"Missing prerequisite courses"
            });

        }


    } catch(error){

        console.error(error);

        res.status(500).json({
            success:false,
            message:"Server error"
        });

    }

};


module.exports = {
  getStudentById,
  checkPrerequisiteEligibility,
  getAllStudents
};