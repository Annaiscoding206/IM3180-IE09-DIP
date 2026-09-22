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

module.exports = {
  getSelectedCourses,
  addSelectedCourse,
  removeSelectedCourse,
  getPlanTimetable
};