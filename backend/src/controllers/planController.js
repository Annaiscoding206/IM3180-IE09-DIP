const pool = require("../config/db");
const getSelectedCourses = async (req, res) => {
  try {
    const { requestId } = req.params;

    const [courses] = await pool.query(
      `
      SELECT
        request_id,
        course_code
      FROM planning_request_course
      WHERE request_id = ?
      ORDER BY course_code
      `,
      [requestId]
    );

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching selected courses:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch selected courses",
    });
  }
};
module.exports = {
  getSelectedCourses,
};