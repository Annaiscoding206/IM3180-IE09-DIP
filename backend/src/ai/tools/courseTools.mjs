
import { tool } from "@openai/agents";
import { z } from "zod";

// Retrieve verified course information from the existing backend.
export async function loadCourseInformation(
  courseCode,
  includeIndexes = false,
  planningTerm = null
) {
  const code = String(courseCode || "").trim().toUpperCase();

  // Validate the course code.
  if (!/^[A-Z0-9]{1,10}$/.test(code)) {
    return {
      status: "invalid_course_code",
      message: "Please provide a valid course code."
    };
  }

  // Reuse our existing Course Explorer API.
  const port = process.env.PORT || 5001;

  const response = await fetch(
    `http://127.0.0.1:${port}/api/courses/${code}`,
    {
      signal: AbortSignal.timeout(5000)
    }
  );

  // Course does not exist.
  if (response.status === 404) {
    return {
      status: "not_found",
      course_code: code,
      message: "Course not found in Smart STARS."
    };
  }

  if (!response.ok) {
    throw new Error(
      `Course API failed with status ${response.status}`
    );
  }

  const result = await response.json();

  if (result.success !== true || !result.data) {
    throw new Error("Course information retrieval failed.");
  }

  const { indexes = [], ...courseDetails } = result.data;
  const scopedIndexes = planningTerm ? indexes.filter(index => index.academic_year === planningTerm.academic_year &&
    Number(index.semester) === Number(planningTerm.semester)) : indexes;

  return {
    status: "ok",
    course_code: code,
    data: {
      ...courseDetails,
      index_count: scopedIndexes.length,
      ...(planningTerm ? { planning_term: planningTerm, available_for_planning_term: scopedIndexes.length > 0 } : {}),

      ...(includeIndexes ? { indexes: scopedIndexes } : {})
    }
  };
}

// Expose the function to OpenAI Agents SDK.
export const getCourseInformationTool = tool({
  name: "get_course_information",

  description: `
    Retrieve verified course information from Smart STARS,
    including course name, academic units, grading type,
    prerequisites, restrictions, available indexes,
    and other metadata.

    Use this tool whenever the student asks about
    a specific NTU course.

    Do not invent course descriptions or missing details.
    This tool provides course information, not
    personalized eligibility decisions.
  `,


  parameters: z.object({
    course_code: z.string().describe(
      "The NTU course code, such as MH1810 or IE3012."
    ),

    include_indexes: z.boolean().describe(
      "Set true only when the student asks about " +
      "course index options, index numbers or vacancies. " +
      "Otherwise set false. For the student's selected " +
      "timetable, use get_student_timetable instead."
    )
  }),

  async execute({ course_code, include_indexes }, runContext) {
    console.log(
      "[AI TOOL] get_course_information called:",
      course_code,
      "include_indexes:",
      include_indexes
    );

    const result = await loadCourseInformation(
      course_code,
      include_indexes,
      runContext?.context?.planningTerm ?? null
    );

    return JSON.stringify(result);
  }

});
