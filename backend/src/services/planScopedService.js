const pool = require("../config/db");
const { PlanningError } = require("./planningError");
const { evaluateEligibility } = require("./eligibilityService");
const { validateBlock } = require("./preferenceValidation");
const { invalidatePlan } = require("./planInvalidationService");

function positiveId(value, name) {
  if (
    !["string", "number"].includes(typeof value) ||
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  ) {
    throw new PlanningError(400, `${name} must be a positive integer`);
  }
  return Number(value);
}

function courseCode(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Z0-9]{1,10}$/i.test(value.trim())
  ) {
    throw new PlanningError(400, "Invalid course_code");
  }
  return value.trim().toUpperCase();
}

async function transaction(action) {
  const db = await pool.getConnection();
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await db.beginTransaction();
    const result = await action(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

// Always lock the parent request before locking the plan.
async function ownedPlan(db, planId, studentId, write = false) {
  const id = positiveId(planId, "planId");

  if (typeof studentId !== "string" || !studentId.trim()) {
    throw new PlanningError(401, "Student identity required");
  }

  const [owners] = await db.query(
    "SELECT request_id FROM plan WHERE plan_id = ?",
    [id]
  );

  if (!owners.length) {
    throw new PlanningError(404, "Plan not found");
  }

  const lock = write ? "FOR UPDATE" : "FOR SHARE";

  const [requests] = await db.query(
    `SELECT request_id FROM planning_request
     WHERE request_id = ? AND student_id = ? ${lock}`,
    [owners[0].request_id, studentId]
  );

  if (!requests.length) {
    throw new PlanningError(404, "Plan not found");
  }

  const [rows] = await db.query(
    `SELECT p.*, pr.student_id, pr.academic_year, pr.semester
     FROM plan p
     JOIN planning_request pr ON pr.request_id = p.request_id
     WHERE p.plan_id = ? AND p.request_id = ? ${lock}`,
    [id, owners[0].request_id]
  );

  if (!rows.length) {
    throw new PlanningError(404, "Plan not found");
  }

  if (write && rows[0].status === "ARCHIVED") {
    throw new PlanningError(409, "Archived plans cannot be edited");
  }

  return rows[0];
}

async function readSelectedCourses(db, planId) {
  const [rows] = await db.query(
    `SELECT plan_id, course_code
     FROM plan_selected_course
     WHERE plan_id = ?
     ORDER BY course_code`,
    [planId]
  );
  return rows;
}

async function readPlanBlocks(db, planId) {
  const [rows] = await db.query(
    `SELECT block_id, plan_id, day_of_week, start_time, end_time
     FROM plan_blocked_period
     WHERE plan_id = ?
     ORDER BY day_of_week, start_time, end_time, block_id`,
    [planId]
  );

  return { plan_id: planId, blocked_periods: rows };
}

function getSelectedCourses(planId, studentId) {
  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId);
    return readSelectedCourses(db, plan.plan_id);
  });
}

function addSelectedCourse(planId, studentId, inputCode) {
  const code = courseCode(inputCode);

  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId, true);
    const current = await readSelectedCourses(db, plan.plan_id);

    if (current.some((row) => row.course_code === code)) {
      throw new PlanningError(409, "Course already selected in this plan");
    }

    const selectedCodes = [
      ...current.map((row) => row.course_code),
      code,
    ];

    const eligibility = await evaluateEligibility(
      plan.student_id,
      code,
      db,
      plan.request_id,
      selectedCodes
    );

    if (!eligibility.can_select) {
      throw new PlanningError(
        422,
        eligibility.message || "Course is not eligible",
        { eligibility }
      );
    }

    const [offerings] = await db.query(
      `SELECT course_code FROM course_info
       WHERE course_code = ?
         AND academic_year = ?
         AND semester = ?
       LIMIT 1`,
      [code, plan.academic_year, plan.semester]
    );

    if (!offerings.length) {
      throw new PlanningError(
        422,
        "Course is not offered in this planning term"
      );
    }

    await db.query(
      `INSERT INTO plan_selected_course (plan_id, course_code)
       VALUES (?, ?)`,
      [plan.plan_id, code]
    );

    await invalidatePlan(db, plan.plan_id);

    return {
      created: true,
      plan_id: plan.plan_id,
      course_code: code,
    };
  });
}

function removeSelectedCourse(planId, studentId, inputCode) {
  const code = courseCode(inputCode);

  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId, true);

    // Removing a course explicitly also removes its chosen index.
    // Both changes are in the same transaction.
    await db.query(
      "DELETE FROM plan_course WHERE plan_id = ? AND course_code = ?",
      [plan.plan_id, code]
    );

    const [result] = await db.query(
      `DELETE FROM plan_selected_course
       WHERE plan_id = ? AND course_code = ?`,
      [plan.plan_id, code]
    );

    if (!result.affectedRows) {
      throw new PlanningError(404, "Course not selected in this plan");
    }

    await invalidatePlan(db, plan.plan_id);

    return { plan_id: plan.plan_id, course_code: code };
  });
}

function getBlocks(planId, studentId) {
  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId);
    return readPlanBlocks(db, plan.plan_id);
  });
}

function addBlock(planId, studentId, body) {
  const block = validateBlock(body);

  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId, true);

    let result;
    try {
      [result] = await db.query(
        `INSERT INTO plan_blocked_period
         (plan_id, day_of_week, start_time, end_time)
         VALUES (?, ?, ?, ?)`,
        [
          plan.plan_id,
          block.day_of_week,
          block.start_time,
          block.end_time,
        ]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new PlanningError(
          409,
          "Blocked period already exists in this plan"
        );
      }
      throw error;
    }

    await invalidatePlan(db, plan.plan_id);

    return {
      created: true,
      block_id: result.insertId,
      plan_id: plan.plan_id,
      ...block,
    };
  });
}

function removeBlock(planId, studentId, blockId) {
  const block = positiveId(blockId, "blockId");

  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId, true);

    const [result] = await db.query(
      `DELETE FROM plan_blocked_period
       WHERE plan_id = ? AND block_id = ?`,
      [plan.plan_id, block]
    );

    if (!result.affectedRows) {
      throw new PlanningError(404, "Blocked period not found");
    }

    await invalidatePlan(db, plan.plan_id);

    return { plan_id: plan.plan_id, block_id: block };
  });
}

function clearBlocks(planId, studentId) {
  return transaction(async (db) => {
    const plan = await ownedPlan(db, planId, studentId, true);

    const [result] = await db.query(
      "DELETE FROM plan_blocked_period WHERE plan_id = ?",
      [plan.plan_id]
    );

    if (result.affectedRows) {
      await invalidatePlan(db, plan.plan_id);
    }

    return {
      plan_id: plan.plan_id,
      removed_count: result.affectedRows,
    };
  });
}

module.exports = {
  readSelectedCourses,
  readPlanBlocks,
  getSelectedCourses,
  addSelectedCourse,
  removeSelectedCourse,
  getBlocks,
  addBlock,
  removeBlock,
  clearBlocks,
};