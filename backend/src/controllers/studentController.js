const pool = require("../config/db");
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
module.exports = {
  getStudentById,
};