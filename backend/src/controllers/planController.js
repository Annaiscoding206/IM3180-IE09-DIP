const pool = require("../config/db");
const { evaluateEligibility, EligibilityNotFoundError } = require("../services/eligibilityService");
const plans = require("../services/planService");
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
      `SELECT request_id, student_id
       FROM planning_request
       WHERE request_id = ?
       LIMIT 1`,
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Planning request not found",
      });
    }

    // This is a planning request, not a generated plan. Use its stored student
    // rather than accepting a student ID supplied by the caller.
    const eligibility = await evaluateEligibility(requests[0].student_id, course_code);
    if (!eligibility.eligible) {
      return res.status(422).json({ success: false, ...eligibility });
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
    if (error instanceof EligibilityNotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("Error adding selected course:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add selected course",
    });
  }
};
const removeSelectedCourse = async (req, res) => {
  try {
    const { requestId, courseCode } = req.params;

    const [result] = await pool.query(
      `
      DELETE FROM planning_request_course
      WHERE request_id = ?
      AND course_code = ?
      `,
      [requestId, courseCode]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Selected course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course removed successfully",
    });
  } catch (error) {
    console.error("Error removing selected course:", error);

    res.status(500).json({
      success: false,
      message: "Failed to remove selected course",
    });
  }
};

const getPlanTimetable = async (req, res) => {

    try {

        const { planId } = req.params;


        const [rows] = await pool.query(
            `
            SELECT
                pc.course_code,
                pc.index_no,
                cs.class_type,
                cs.day_of_week,
                cs.start_time,
                cs.end_time,
                cs.venue

            FROM plan_course pc

            JOIN class_slots cs
            ON pc.course_code = cs.course_code
            AND pc.index_no = cs.index_no

            WHERE pc.plan_id = ?

            ORDER BY cs.day_of_week, cs.start_time
            `,
            [planId]
        );


        res.json({
            success:true,
            plan_id:planId,
            data:rows
        });


    } catch(error){

        console.error(error);

        res.status(500).json({
            success:false,
            message:"Failed to retrieve timetable"
        });

    }

};

const handlePlan = (action) => async (req, res) => {
  try {
    const data = await action(req);
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
  getPlan: handlePlan((req) => plans.getPlan(req.params.planId)),
  getPlanIndexes: handlePlan((req) => plans.getIndexes(req.params.planId)),
  putPlanIndex: handlePlan((req) => plans.putIndex(req.params.planId, req.params.courseCode, req.body || {})),
  removePlanIndex: handlePlan((req) => plans.removeIndex(req.params.planId, req.params.courseCode)),
  getPlanClashes: handlePlan((req) => plans.getClashes(req.params.planId)),
  previewPlanIndex: handlePlan((req) => plans.previewIndex(req.params.planId, req.body || {})),
};
