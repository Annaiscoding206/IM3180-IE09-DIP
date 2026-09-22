const pool = require("../config/db");

// GET /api/courses
const getCourses = async (req, res) => {
  try {
    const { 
  search,
  au,
  semester,
  academic_year
    } = req.query;

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

    let conditions = [];

if (search) {
  conditions.push(`
    (
      course_code LIKE ?
      OR course_name LIKE ?
    )
  `);

  const searchTerm = `%${search}%`;
  params.push(searchTerm, searchTerm);
}


if (au) {
  conditions.push(`au = ?`);
  params.push(au);
}


if (semester) {
  conditions.push(`semester = ?`);
  params.push(semester);
}


if (academic_year) {
  conditions.push(`academic_year = ?`);
  params.push(academic_year);
}


if (conditions.length > 0) {
  sql += `
    WHERE ${conditions.join(" AND ")}
  `;
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
      data: {
        ...courses[0],
        indexes: indexes
      }
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

const getIndexTimetable = async (req, res) => {
    try {
        const { courseCode, indexNo } = req.params;

        const [rows] = await pool.query(
            `
            SELECT 
                class_type,
                class_group,
                day_of_week,
                start_time,
                end_time,
                venue,
                teaching_weeks
            FROM class_slots
            WHERE course_code = ?
            AND index_no = ?
            ORDER BY day_of_week, start_time
            `,
            [courseCode, indexNo]
        );


        res.json({
            success: true,
            course_code: courseCode,
            index_no: indexNo,
            count: rows.length,
            data: rows
        });


    } catch (error) {
        console.error(error);

        res.status(500).json({
            success:false,
            message:"Failed to retrieve timetable"
        });
    }
};

module.exports = {
  getCourses,
  getCourseByCode,
  getCourseIndexes,
  getIndexTimetable
};