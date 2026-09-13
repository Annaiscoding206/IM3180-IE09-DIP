const pool = require("../config/db");

// GET /api/courses
const getCourses = async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT DISTINCT
        course_code,
        course_name,
        au,
        grading_type,
        exam_datetime,
        prerequisite_text,
        restriction_text,
        mutually_exclusive_text,
        bde,
        gepe,
        academic_year,
        semester
      FROM course_info
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE course_code LIKE ?
        OR course_name LIKE ?
      `;

      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ` ORDER BY course_code`;

    const [courses] = await pool.query(sql, params);

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch courses",
    });
  }
};

// GET /api/courses/:courseCode
const getCourseByCode = async (req, res) => {
  try {
    const { courseCode } = req.params;

    const [courses] = await pool.query(
      `
      SELECT DISTINCT
        course_code,
        course_name,
        au,
        grading_type,
        exam_datetime,
        prerequisite_text,
        restriction_text,
        mutually_exclusive_text,
        bde,
        gepe,
        academic_year,
        semester
      FROM course_info
      WHERE course_code = ?
      `,
      [courseCode]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      data: courses[0],
    });
  } catch (error) {
    console.error("Error fetching course:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch course",
    });
  }
};

// GET /api/courses/:courseCode/indexes
const getCourseIndexes = async (req, res) => {
  try {
    const { courseCode } = req.params;

    // Check whether the course exists
    const [courses] = await pool.query(
      `
      SELECT course_code
      FROM course_info
      WHERE course_code = ?
      LIMIT 1
      `,
      [courseCode]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get all indexes belonging to the course
    const [indexes] = await pool.query(
      `
      SELECT DISTINCT
        index_no,
        vacancy,
        vacancy_updated_at
      FROM course_info
      WHERE course_code = ?
      ORDER BY index_no
      `,
      [courseCode]
    );

    res.status(200).json({
      success: true,
      course_code: courseCode,
      count: indexes.length,
      data: indexes,
    });
  } catch (error) {
    console.error("Error fetching course indexes:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch course indexes",
    });
  }
};

module.exports = {
  getCourses,
  getCourseByCode,
  getCourseIndexes
};