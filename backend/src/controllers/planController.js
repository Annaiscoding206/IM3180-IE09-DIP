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
const addSelectedCourse = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { course_code } = req.body;

    const [requests] = await pool.query(
  `
  SELECT request_id
  FROM planning_request
  WHERE request_id = ?
  LIMIT 1
  `,
  [requestId]
);

if (requests.length === 0) {
  return res.status(404).json({
    success: false,
    message: "Planning request not found",
  });
}

    const [courses] = await pool.query(
  `
  SELECT course_code
  FROM course_info
  WHERE course_code = ?
  LIMIT 1
  `,
  [course_code]
);

if (courses.length === 0) {
  return res.status(404).json({
    success: false,
    message: "Course not found",
  });
}

    await pool.query(
      `
      INSERT INTO planning_request_course (
        request_id,
        course_code
      )
      VALUES (?, ?)
      `,
      [requestId, course_code]
    );

    res.status(201).json({
      success: true,
      message: "Course added successfully",
    });
  } catch (error) {
    console.error("Error adding selected course:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add selected course",
    });
  }
};
module.exports = {
  getSelectedCourses,
  addSelectedCourse,
};