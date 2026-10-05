const pool = require("../config/db");

class CourseInputError extends Error {}
function codeParam(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(value.trim())) {
    throw new CourseInputError("courseCode must contain 1–10 letters or digits");
  }
  return value.trim().toUpperCase();
}
function indexParam(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647) {
    throw new CourseInputError("indexNo must be a positive integer");
  }
  return Number(value);
}
function validateFilters(query) {
  for (const key of ["search", "au", "semester", "academic_year"]) {
    if (query[key] !== undefined && (typeof query[key] !== "string" || !query[key].trim())) {
      throw new CourseInputError(`${key} must be a nonempty string`);
    }
  }
  if (query.au !== undefined && (!/^\d+(?:\.\d+)?$/.test(query.au) || !Number.isFinite(Number(query.au)) || Number(query.au) <= 0)) {
    throw new CourseInputError("au must be a positive number");
  }
  if (query.semester !== undefined && !/^[1-3]$/.test(query.semester)) {
    throw new CourseInputError("semester must be 1, 2 or 3");
  }
}


// GET /api/courses
const getCourses = async (req, res) => {
  try {
    validateFilters(req.query);
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
    if (error instanceof CourseInputError) {
      return res.status(400).json({ success: false, message: error.message });
    }
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
    const courseCode = codeParam(req.params.courseCode);

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
    if (error instanceof CourseInputError) {
      return res.status(400).json({ success: false, message: error.message });
    }
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
    const courseCode = codeParam(req.params.courseCode);

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
    if (error instanceof CourseInputError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Error fetching course indexes:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch course indexes",
    });
  }
};

const getIndexTimetable = async (req, res) => {
    try {
        const courseCode = codeParam(req.params.courseCode);
        const indexNo = indexParam(req.params.indexNo);
        const [indexes] = await pool.query(
            "SELECT course_code, index_no FROM course_info WHERE course_code = ? AND index_no = ? LIMIT 1",
            [courseCode, indexNo]
        );
        if (!indexes.length) {
            return res.status(404).json({ success: false, message: "Course/index pair not found" });
        }

        const [rows] = await pool.query(
            `
            SELECT 
                slot_id,
                course_code,
                index_no,
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
            ORDER BY FIELD(day_of_week, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'), start_time, slot_id
            `,
            [courseCode, indexNo]
        );


        res.json({
            success: true,
            course_code: courseCode,
            index_no: req.params.indexNo,
            timetable_available: rows.length > 0,
            count: rows.length,
            data: rows
        });


    } catch (error) {
    if (error instanceof CourseInputError) {
      return res.status(400).json({ success: false, message: error.message });
    }
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