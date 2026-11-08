const pool = require("../config/db");
const { EligibilityNotFoundError } = require("../services/eligibilityService");
const planScope = require("../services/planScopedService");
const plans = require("../services/planService");
const getSelectedCourses = async (req, res) => {
  try {
    // Validates the ID and checks that the request exists.
    const request = await plans.getRequest(req.params.requestId);

    const [courses] = await pool.query(
      `SELECT request_id, course_code
       FROM planning_request_course
       WHERE request_id = ?
       ORDER BY course_code`,
      [request.request_id]
    );

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Error fetching selected courses:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch selected courses",
    });
  }
};

const addSelectedCourse = async (req, res) => {
  try {
    await plans.addCourseToRequest(
      req.params.requestId,
      req.body?.course_code
    );

    return res.status(201).json({
      success: true,
      message: "Course added successfully",
    });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        ...error.details,
      });
    }

    if (error instanceof EligibilityNotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Course is already selected in this planning request",
      });
    }

    console.error("Error adding selected course:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add selected course",
    });
  }
};

const removeSelectedCourse = async (req, res) => {
  try {
    await plans.removeCourseFromRequest(
      req.params.requestId,
      req.params.courseCode
    );

    return res.status(200).json({
      success: true,
      message: "Course removed successfully",
    });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        ...error.details,
      });
    }

    console.error("Error removing selected course:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove selected course",
    });
  }
};

const getPlanTimetable = async (req, res) => {
  try {
    const plan = await plans.getPlan(req.params.planId);

    const [rows] = await pool.query(
      `SELECT
         pc.course_code,
         pc.index_no,
         cs.slot_id,
         cs.class_type,
         cs.class_group,
         cs.day_of_week,
         cs.start_time,
         cs.end_time,
         cs.venue,
         cs.teaching_weeks
       FROM plan_course pc
       LEFT JOIN class_slots cs
         ON pc.course_code = cs.course_code
         AND pc.index_no = cs.index_no
       WHERE pc.plan_id = ?
       ORDER BY
         FIELD(cs.day_of_week,
           'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'),
         cs.start_time,
         pc.course_code,
         pc.index_no,
         cs.slot_id`,
      [plan.plan_id]
    );

    const missingSlotIndexes = rows
      .filter((row) => row.slot_id === null)
      .map((row) => ({
        course_code: row.course_code,
        index_no: row.index_no,
      }));

    const sessions = rows.filter((row) => row.slot_id !== null);

    return res.status(200).json({
      success: true,
      plan_id: plan.plan_id,
      empty_plan: rows.length === 0,
      timetable_available: sessions.length > 0,
      timetable_complete:
        rows.length > 0 && missingSlotIndexes.length === 0,
      missing_slot_indexes: missingSlotIndexes,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Error retrieving plan timetable:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve timetable",
    });
  }
};

const handlePlan = (action) => async (req, res) => {
  try {
    const data = await action(req, res);
    return res.status(data.created === true ? 201 : 200).json({
      success: true, ...(Array.isArray(data) ? { count: data.length } : {}), data,
    });
  } catch (error) {
    if (error instanceof plans.PlanningError) {
      return res.status(error.status).json({ success: false, message: error.message, ...error.details });
    }
    if (error instanceof EligibilityNotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("Plan operation error:", error);
    return res.status(500).json({ success: false, message: "Plan operation failed" });
  }
};

module.exports = {
  getSelectedCourses,
  addSelectedCourse,
  removeSelectedCourse,
  getPlanTimetable,
  getPlanSummary: handlePlan((req, res) => require("../services/planningSummaryService").getPlanSummary(req.params.planId, res.locals.authenticatedStudentId)),
  getPlan: handlePlan((req) => plans.getPlanDetails(req.params.planId)),
  getPlanIndexes: handlePlan((req) => plans.getIndexes(req.params.planId)),
  putPlanIndex: handlePlan((req) => plans.putIndex(req.params.planId, req.params.courseCode, req.body || {})),
  setPlanIndexLock: handlePlan((req) => plans.setIndexLock(req.params.planId, req.params.courseCode, req.body || {})),
  removePlanIndex: handlePlan((req) => plans.removeIndex(req.params.planId, req.params.courseCode)),
  getPlanClashes: handlePlan((req) => plans.getClashes(req.params.planId)),
  previewPlanIndex: handlePlan((req) => plans.previewIndex(req.params.planId, req.body || {})),
  getPlanEligibility: handlePlan(
  (req) => plans.getPlanEligibility(req.params.planId)
  ),
  getPlanValidation: handlePlan(
  (req) => plans.getPlanValidation(req.params.planId)
  ),
  selectPlan: handlePlan(
  (req) => plans.selectPlan(req.params.planId)
  ),
    getPlanSelectedCourses: handlePlan((req, res) =>
    planScope.getSelectedCourses(
      req.params.planId,
      res.locals.authenticatedStudentId
    )
  ),

  addPlanSelectedCourse: handlePlan((req, res) =>
    planScope.addSelectedCourse(
      req.params.planId,
      res.locals.authenticatedStudentId,
      req.body?.course_code
    )
  ),

  removePlanSelectedCourse: handlePlan((req, res) =>
    planScope.removeSelectedCourse(
      req.params.planId,
      res.locals.authenticatedStudentId,
      req.params.courseCode
    )
  ),

  getPlanBlockedPeriods: handlePlan((req, res) =>
    planScope.getBlocks(
      req.params.planId,
      res.locals.authenticatedStudentId
    )
  ),

  addPlanBlockedPeriod: handlePlan((req, res) =>
    planScope.addBlock(
      req.params.planId,
      res.locals.authenticatedStudentId,
      req.body
    )
  ),

  removePlanBlockedPeriod: handlePlan((req, res) =>
    planScope.removeBlock(
      req.params.planId,
      res.locals.authenticatedStudentId,
      req.params.blockId
    )
  ),

  clearPlanBlockedPeriods: handlePlan((req, res) =>
    planScope.clearBlocks(
      req.params.planId,
      res.locals.authenticatedStudentId
    )
  ),
};
