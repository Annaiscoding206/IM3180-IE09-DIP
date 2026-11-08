const { PlanningError } = require("../services/planningError");
const pool = require("../config/db");
const { getCourseAnnotations } = require("../services/curriculumService");
const { resolvePlanContext, contextId } = require("../services/planContextService");

// planning_request_id is term-only: it never supplies request-level selections
// to academic eligibility or Curriculum. plan_id retains independent-plan context.
async function catalogueRows(courses, req, res) {
  const annotate = await completionAnnotation(req, res);
  const student = res.locals?.authenticatedStudentId;
  let term = null;
  if (req.query.plan_id !== undefined) {
    const context = await resolvePlanContext(student, {
      plan_id: req.query.plan_id,
      ...(req.query.request_id !== undefined ? { request_id: req.query.request_id } : {}),
    });
    term = { academic_year: context.academic_year, semester: context.semester };
    if (req.query.planning_request_id !== undefined &&
        contextId(req.query.planning_request_id, 'planning_request_id') !== Number(context.request_id)) {
      throw new PlanningError(404, 'Plan does not belong to this planning request');
    }
  } else if (req.query.planning_request_id !== undefined) {
    if (!student) throw new PlanningError(401, 'Student identity required');
    const id = contextId(req.query.planning_request_id, 'planning_request_id');
    const [[request]] = await pool.query('SELECT academic_year, semester FROM planning_request WHERE request_id = ? AND student_id = ?', [id, student]);
    if (!request) throw new PlanningError(404, 'Planning request not found');
    term = { academic_year: request.academic_year, semester: request.semester };
  }
  if (!courses.length) return [];
  const [offerings] = await pool.query(`SELECT DISTINCT course_code, academic_year, semester
    FROM course_info WHERE course_code IN (?) ORDER BY academic_year, semester`, [[...new Set(courses.map(c => c.course_code))]]);
  const matches = row => term !== null && row.academic_year === term.academic_year && Number(row.semester) === Number(term.semester);
  // One card per course, preferring metadata for the planning term, otherwise
  // the latest returned offering. Explicit catalogue filters still constrain rows.
  const grouped = new Map();
  for (const row of [...courses].sort((a, b) => Number(matches(b)) - Number(matches(a)) ||
    String(b.academic_year).localeCompare(String(a.academic_year)) || Number(b.semester) - Number(a.semester))) {
    if (!grouped.has(row.course_code)) grouped.set(row.course_code, row);
  }
  return [...grouped.values()].sort((a, b) => a.course_code.localeCompare(b.course_code)).map(row => {
    const terms = offerings.filter(o => o.course_code === row.course_code)
      .map(({ academic_year, semester }) => ({ academic_year, semester }));
    return { ...annotate(withCourseTypes(row)), available_semesters: terms,
      planning_term: term, available_for_planning_term: term === null ? null : terms.some(matches) };
  });
}

async function completionAnnotation(req, res) {
  const student = res.locals?.authenticatedStudentId;
  const query = Object.fromEntries(['plan_id', 'request_id'].filter(k => req.query[k] !== undefined).map(k => [k, req.query[k]]));
  if (!student && Object.keys(query).length) throw new PlanningError(401, 'Student identity required');
  return student ? getCourseAnnotations(student, query) : course => course;
}

class CourseInputError extends Error {}
function withCourseTypes(course) {
  return {
    ...course,
    course_types: course.course_types
      ? course.course_types.split(",")
      : [],
  };
}
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
        semester,
        (
          SELECT GROUP_CONCAT(
            ct.type_code
            ORDER BY FIELD(ct.type_code, 'CORE', 'MPE', 'BDE')
            SEPARATOR ','
          )
          FROM course_type ct
          WHERE ct.course_code = course_info.course_code
        ) AS course_types
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
    const annotated = await catalogueRows(courses, req, res);

    res.status(200).json({
      success: true,
      count: annotated.length,
      data: annotated,
    });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
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
        semester,
        (
          SELECT GROUP_CONCAT(
            ct.type_code
            ORDER BY FIELD(ct.type_code, 'CORE', 'MPE', 'BDE')
            SEPARATOR ','
          )
          FROM course_type ct
          WHERE ct.course_code = course_info.course_code
        ) AS course_types
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
      vacancy_updated_at,
      academic_year,
      semester
      FROM course_info
      WHERE course_code = ?
      ORDER BY index_no
      `,
    [courseCode]
    );

    const annotated = await catalogueRows(courses, req, res);
    res.status(200).json({
      success: true,
      data: {
        ...annotated[0],
        indexes: annotated[0].planning_term ? indexes.filter(index =>
          index.academic_year === annotated[0].planning_term.academic_year &&
          Number(index.semester) === Number(annotated[0].planning_term.semester)) : indexes
      }
    });
  } catch (error) {
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
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
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
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
    if (error instanceof PlanningError) return res.status(error.status).json({ success: false, message: error.message, ...error.details });
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
