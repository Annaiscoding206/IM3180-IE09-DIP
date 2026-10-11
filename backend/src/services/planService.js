const pool = require("../config/db");
const { evaluateEligibility } = require("./eligibilityService");
const { checkClashes } = require("./clashService");

class PlanningError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function integer(value, name, max = 2147483647) {
  if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new PlanningError(400, `${name} must be a positive integer${max === 3 ? " between 1 and 3" : ""}`);
  }
  return Number(value);
}

function text(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new PlanningError(400, `${name} must be a nonempty string of at most ${max} characters`);
  }
  return value.trim();
}

async function getRequest(requestId, db = pool) {
  const id = integer(requestId, "requestId");
  const [rows] = await db.query("SELECT * FROM planning_request WHERE request_id = ?", [id]);
  if (!rows.length) throw new PlanningError(404, "Planning request not found");
  const [selectedCourses] = await db.query(
    "SELECT course_code FROM planning_request_course WHERE request_id = ? ORDER BY course_code",
    [id]
  );
  return {
    ...rows[0],
    selected_courses: selectedCourses.map((row) => row.course_code),
  };
}

async function requireStudent(studentId) {
  const id = text(studentId, "student_id", 15);
  const [rows] = await pool.query("SELECT student_id FROM student WHERE student_id = ?", [id]);
  if (!rows.length) throw new PlanningError(404, "Student not found");
  return rows[0].student_id;
}

async function createRequest(body = {}) {
  const academicYear = text(body.academic_year, "academic_year", 20);
  const semester = integer(body.semester, "semester", 3);
  const targetAu = body.target_au == null ? null : integer(body.target_au, "target_au");
  const studentId = await requireStudent(body.student_id);
  const [result] = await pool.query(
    `INSERT INTO planning_request (student_id, academic_year, semester, target_au) VALUES (?, ?, ?, ?)`,
    [studentId, academicYear, semester, targetAu]
  );
  return getRequest(result.insertId);
}

async function listRequests(studentId) {
  const id = await requireStudent(studentId);
  const [rows] = await pool.query("SELECT * FROM planning_request WHERE student_id = ? ORDER BY request_id", [id]);
  return rows;
}

async function createPlan(requestId, body = {}) {
  const name = text(body.plan_name, "plan_name", 50);
  const request = await getRequest(requestId);
  try {
    const [result] = await pool.query("INSERT INTO plan (request_id, plan_name) VALUES (?, ?)", [request.request_id, name]);
    return getPlan(result.insertId);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new PlanningError(409, "Plan name already exists for this planning request");
    throw error;
  }
}

async function listPlans(requestId) {
  const request = await getRequest(requestId);
  const [rows] = await pool.query("SELECT * FROM plan WHERE request_id = ? ORDER BY plan_id", [request.request_id]);
  return rows;
}

async function getPlan(planId, db = pool, lock = false) {
  const id = integer(planId, "planId");

  if (lock) {
    // Discover the parent without locking the plan first.
    const [owners] = await db.query(
      "SELECT request_id FROM plan WHERE plan_id = ?",
      [id]
    );

    if (!owners.length) {
      throw new PlanningError(404, "Plan not found");
    }

    // Serialize changes for this request before locking any plan.
    const [requests] = await db.query(
      `SELECT request_id
       FROM planning_request
       WHERE request_id = ?
       FOR UPDATE`,
      [owners[0].request_id]
    );

    if (!requests.length) {
      throw new PlanningError(404, "Planning request not found");
    }
  }

  const [rows] = await db.query(
    `SELECT p.*, pr.student_id, pr.academic_year, pr.semester
     FROM plan p
     JOIN planning_request pr ON pr.request_id = p.request_id
     WHERE p.plan_id = ?${lock ? " FOR UPDATE" : ""}`,
    [id]
  );

  if (!rows.length) {
    throw new PlanningError(404, "Plan not found");
  }

  return rows[0];
}

async function readIndexes(planId, db) {
  const [rows] = await db.query("SELECT * FROM plan_course WHERE plan_id = ? ORDER BY course_code", [planId]);
  return rows;
}

async function getIndexes(planId) {
  const plan = await getPlan(planId);
  return readIndexes(plan.plan_id, pool);
}

async function validateCandidate(plan, courseCode, indexNo, db, lock) {
  const code = text(courseCode, "course_code", 10).toUpperCase();
  const index = integer(indexNo, "index_no");
  const [selected] = await db.query(
    `SELECT course_code FROM planning_request_course WHERE request_id = ? AND course_code = ?${lock ? " FOR UPDATE" : ""}`,
    [plan.request_id, code]
  );
  if (!selected.length) throw new PlanningError(422, "Course must be selected in the parent planning request");
  const [courses] = await db.query(
    "SELECT course_code, index_no, academic_year, semester FROM course_info WHERE course_code = ? AND index_no = ?", [code, index]
  );
  if (!courses.length) throw new PlanningError(404, "Course/index pair not found");
  const course = courses[0];
  if (course.academic_year !== plan.academic_year || course.semester !== plan.semester) {
    throw new PlanningError(422, "Course/index does not match the planning request academic year and semester");
  }
  const eligibility = await evaluateEligibility(
    plan.student_id,
    course.course_code,
    db,
    plan.request_id
  );
  if (!eligibility.can_select) {
  throw new PlanningError(
    422,
    "Course cannot be selected for this student",
    { eligibility }
  );
}
  return { course_code: course.course_code, index_no: course.index_no };
}

async function validateTimetable(planId, indexes, db, candidate) {
  // Read each index independently so missing slots cannot disappear in an INNER JOIN.
  const schedules = [];
  for (const index of indexes) {
    const [slots] = await db.query(
      `SELECT slot_id, class_type, class_group, day_of_week, start_time, end_time, venue, teaching_weeks
       FROM class_slots WHERE course_code = ? AND index_no = ? ORDER BY slot_id`,
      [index.course_code, index.index_no]
    );
    schedules.push({ ...index, slots });
  }
  return { plan_id: planId, ...(candidate ? { candidate } : {}), ...checkClashes(schedules) };
}

const withoutCourse = (indexes, code) => indexes.filter((row) => row.course_code.toUpperCase() !== code.toUpperCase());

async function getClashes(planId) {
  const plan = await getPlan(planId);
  return validateTimetable(plan.plan_id, await readIndexes(plan.plan_id, pool), pool);
}

async function previewIndex(planId, body = {}) {
  const plan = await getPlan(planId);
  const candidate = await validateCandidate(plan, body.course_code, body.index_no, pool, false);
  const indexes = withoutCourse(await readIndexes(plan.plan_id, pool), candidate.course_code);
  return validateTimetable(plan.plan_id, [...indexes, candidate], pool, candidate);
}

async function transaction(action) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      "SET TRANSACTION ISOLATION LEVEL READ COMMITTED"
    );
    await connection.beginTransaction();
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function putIndex(planId, courseCode, body = {}) {
  return transaction(async (db) => {
    // Every index writer locks the parent before reading indexes. Concurrent
    // writes to the same plan cannot both validate against the old timetable.
    const plan = await getPlan(planId, db, true);
    const candidate = await validateCandidate(plan, courseCode, body.index_no, db, true);
    const current = await readIndexes(plan.plan_id, db);
    const remaining = withoutCourse(current, candidate.course_code);
    const validation = await validateTimetable(plan.plan_id, [...remaining, candidate], db, candidate);
    if (!validation.can_save) {
      throw new PlanningError(422, "Index cannot be saved: timetable validation failed", { validation });
    }
    const created = remaining.length === current.length;
    if (created) {
      await db.query("INSERT INTO plan_course (plan_id, course_code, index_no) VALUES (?, ?, ?)",
        [plan.plan_id, candidate.course_code, candidate.index_no]);
    } else {
      // Preserve locked: it refers to future regeneration, not explicit edits.
      await db.query("UPDATE plan_course SET index_no = ? WHERE plan_id = ? AND course_code = ?",
        [candidate.index_no, plan.plan_id, candidate.course_code]);
    }
      await db.query(
      `UPDATE plan
       SET rank_no = NULL,
           match_score = NULL,
           status = CASE
             WHEN status = 'SELECTED' THEN 'GENERATED'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE plan_id = ?`,
      [plan.plan_id]
    );
    return { created, plan_id: plan.plan_id, ...candidate, validation };
  });
}

async function removeIndex(planId, courseCode) {
  const code = text(courseCode, "course_code", 10).toUpperCase();
  return transaction(async (db) => {
    const plan = await getPlan(planId, db, true);
    const [result] = await db.query("DELETE FROM plan_course WHERE plan_id = ? AND course_code = ?", [plan.plan_id, code]);
    if (!result.affectedRows) throw new PlanningError(404, "Chosen course index not found");
      await db.query(
      `UPDATE plan
       SET rank_no = NULL,
           match_score = NULL,
           status = CASE
             WHEN status = 'SELECTED' THEN 'GENERATED'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE plan_id = ?`,
      [plan.plan_id]
    );
    return { plan_id: plan.plan_id, course_code: code };
  });
}
async function getPlanEligibility(planId, db = pool) {
  const plan = await getPlan(planId, db);
  const indexes = await readIndexes(plan.plan_id, db);

  const planCourseCodes = [
    ...new Set(
      indexes.map((row) => row.course_code.trim().toUpperCase())
    ),
  ];

  const [requestedCourses] = await db.query(
    `SELECT course_code
     FROM planning_request_course
     WHERE request_id = ?
     ORDER BY course_code`,
    [plan.request_id]
  );

  const requestedCodes = new Set(
    requestedCourses.map((row) => row.course_code.trim().toUpperCase())
  );
  const includedCodes = new Set(planCourseCodes);

  const missingIndexCourses = [...requestedCodes]
    .filter((code) => !includedCodes.has(code))
    .sort();

  const unselectedCourses = planCourseCodes
    .filter((code) => !requestedCodes.has(code))
    .sort();

  const courseResults = [];

  for (const courseCode of planCourseCodes) {
    const result = await evaluateEligibility(
      plan.student_id,
      courseCode,
      db,
      plan.request_id,
      planCourseCodes
    );

    courseResults.push(result);
  }

  const eligible =
    courseResults.length > 0 &&
    missingIndexCourses.length === 0 &&
    unselectedCourses.length === 0 &&
    courseResults.every((result) => result.eligible);

  return {
    plan_id: plan.plan_id,
    request_id: plan.request_id,
    student_id: plan.student_id,
    eligible,
    empty_plan: courseResults.length === 0,
    requires_review: courseResults.some(
      (result) => result.requires_review
    ),
    missing_index_courses: missingIndexCourses,
    unselected_courses: unselectedCourses,
    courses: courseResults,
  };
}
async function addCourseToRequest(requestId, courseCode) {
  const id = integer(requestId, "requestId");

  if (
    typeof courseCode !== "string" ||
    !/^[A-Z0-9]{1,10}$/i.test(courseCode.trim())
  ) {
    throw new PlanningError(
      400,
      "course_code must contain 1–10 letters or digits"
    );
  }

  const code = courseCode.trim().toUpperCase();

  return transaction(async (db) => {
    // Add operations for the same request must run one at a time.
    const [requests] = await db.query(
      `SELECT request_id, student_id
       FROM planning_request
       WHERE request_id = ?
       FOR UPDATE`,
      [id]
    );

    if (requests.length === 0) {
      throw new PlanningError(404, "Planning request not found");
    }

    const [existing] = await db.query(
      `SELECT course_code
       FROM planning_request_course
       WHERE request_id = ? AND course_code = ?`,
      [id, code]
    );

    if (existing.length > 0) {
      throw new PlanningError(
        409,
        "Course is already selected in this planning request"
      );
    }

    const eligibility = await evaluateEligibility(
      requests[0].student_id,
      code,
      db,
      id
    );

    if (!eligibility.can_select) {
      throw new PlanningError(422, eligibility.message, eligibility);
    }

    await db.query(
      `INSERT INTO planning_request_course (request_id, course_code)
       VALUES (?, ?)`,
      [id, code]
    );

    await db.query(
      `UPDATE plan
       SET rank_no = NULL,
           match_score = NULL,
           status = CASE
             WHEN status = 'SELECTED' THEN 'GENERATED'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = ?`,
      [id]
    );

    return {
      request_id: id,
      course_code: code,
    };
  });
}

async function removeCourseFromRequest(requestId, courseCode) {
  const id = integer(requestId, "requestId");

  if (
    typeof courseCode !== "string" ||
    !/^[A-Z0-9]{1,10}$/i.test(courseCode.trim())
  ) {
    throw new PlanningError(
      400,
      "course_code must contain 1–10 letters or digits"
    );
  }

  const code = courseCode.trim().toUpperCase();

  return transaction(async (db) => {
    const [requests] = await db.query(
      `SELECT request_id
       FROM planning_request
       WHERE request_id = ?
       FOR UPDATE`,
      [id]
    );

    if (requests.length === 0) {
      throw new PlanningError(404, "Planning request not found");
    }

    const [usedByPlans] = await db.query(
      `SELECT p.plan_id, p.plan_name
       FROM plan p
       JOIN plan_course pc ON pc.plan_id = p.plan_id
       WHERE p.request_id = ? AND pc.course_code = ?
       ORDER BY p.plan_id`,
      [id, code]
    );

    if (usedByPlans.length > 0) {
      throw new PlanningError(
        409,
        "Remove this course's index from its plans before removing the selected course",
        { affected_plans: usedByPlans }
      );
    }

    const [result] = await db.query(
      `DELETE FROM planning_request_course
       WHERE request_id = ? AND course_code = ?`,
      [id, code]
    );

    if (result.affectedRows === 0) {
      throw new PlanningError(404, "Selected course not found");
    }

      await db.query(
      `UPDATE plan
       SET rank_no = NULL,
           match_score = NULL,
           status = CASE
             WHEN status = 'SELECTED' THEN 'GENERATED'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = ?`,
      [id]
    );

    return { request_id: id, course_code: code };
  });
}

async function getPlanValidation(planId, db = null) {
  if (db === null) {
    return transaction((connection) =>
      getPlanValidation(planId, connection)
    );
  }
    const plan = await getPlan(planId, db, true);
    const indexes = await readIndexes(plan.plan_id, db);

    const eligibility = await getPlanEligibility(plan.plan_id, db);

    const timetable = await validateTimetable(
      plan.plan_id,
      indexes,
      db
    );

    const [invalidIndexes] = await db.query(
      `SELECT pc.course_code, pc.index_no
       FROM plan_course pc
       LEFT JOIN course_info ci
         ON ci.course_code = pc.course_code
         AND ci.index_no = pc.index_no
       WHERE pc.plan_id = ?
         AND (
           ci.course_code IS NULL
           OR ci.academic_year IS NULL
           OR ci.semester IS NULL
           OR ci.academic_year <> ?
           OR ci.semester <> ?
         )
       ORDER BY pc.course_code`,
      [plan.plan_id, plan.academic_year, plan.semester]
    );

    const canFinalize =
      eligibility.eligible &&
      timetable.can_save &&
      invalidIndexes.length === 0;

    return {
      plan_id: plan.plan_id,
      request_id: plan.request_id,
      can_finalize: canFinalize,
      requires_review: eligibility.requires_review,
      invalid_term_indexes: invalidIndexes,
      eligibility,
      timetable,
    };

}

async function selectPlan(planId) {
  return transaction(async (db) => {
    const validation = await getPlanValidation(planId, db);

    if (!validation.can_finalize) {
      throw new PlanningError(
        422,
        "Plan cannot be selected: final validation failed",
        { validation }
      );
    }

    // Only one plan is selected for this planning request.
    await db.query(
      `UPDATE plan
       SET status = 'GENERATED',
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = ? AND status = 'SELECTED'`,
      [validation.request_id]
    );

    await db.query(
      `UPDATE plan
       SET status = 'SELECTED',
           updated_at = CURRENT_TIMESTAMP
       WHERE plan_id = ?`,
      [validation.plan_id]
    );

    return {
      plan_id: validation.plan_id,
      request_id: validation.request_id,
      status: "SELECTED",
      validation,
    };
  });
}

module.exports = {
  PlanningError, createRequest, listRequests, getRequest, createPlan, listPlans,
  getPlan, getIndexes, getClashes, previewIndex, putIndex, removeIndex,
  getPlanEligibility, getPlanValidation, selectPlan,
  addCourseToRequest, removeCourseFromRequest,
};
