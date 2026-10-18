import pool from "../../config/db.js";
import { tool } from "@openai/agents";
import { z } from "zod";
import eligibilityService from "../../services/eligibilityService.js";

// Retrieve eligibility from the existing backend service.
export async function loadCourseEligibility(
  studentId,
  courseCode,
  requestId = null
) {
  if (!studentId) {
    return {
      status: "authentication_required",
      message: "Student identity is required."
    };
  }

  const code = String(courseCode || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9]{1,10}$/.test(code)) {
    return {
      status: "invalid_course_code",
      message: "Please provide a valid course code."
    };
  }

  // Only allow valid planning-request identifiers.
  if (
    requestId !== null &&
    (!Number.isSafeInteger(requestId) || requestId <= 0)
  ) {
    return {
      status: "invalid_request_id",
      message: "Invalid planning request."
    };
  }

  try {
    // Reuse the existing eligibility service.
    // Passing undefined uses its default database pool.

const result = await eligibilityService.evaluateEligibility(
  studentId,
  code,
  undefined,
  requestId
);

// Retrieve the actual prerequisite and corequisite
// definitions from the existing database.
const [requirements] = await pool.query(
  `
  SELECT DISTINCT
    requirement_type,
    required_course_code,
    requirement_group
  FROM course_requirement
  WHERE course_code = ?
    AND requirement_type IN (
      'PREREQUISITE',
      'COREQUISITE'
    )
  ORDER BY
    requirement_type,
    requirement_group,
    required_course_code
  `,
  [code]
);

return {
  status: "ok",
  data: {
    ...result,

    recorded_course_requirements: {
      prerequisites: requirements
        .filter(
          (row) =>
            row.requirement_type === "PREREQUISITE"
        )
        .map((row) => ({
          course_code: row.required_course_code,
          requirement_group: row.requirement_group
        })),

      corequisites: requirements
        .filter(
          (row) =>
            row.requirement_type === "COREQUISITE"
        )
        .map((row) => ({
          course_code: row.required_course_code,
          requirement_group: row.requirement_group
        }))
    }
  }
};


  } catch (error) {
    if (
      error instanceof
      eligibilityService.EligibilityNotFoundError
    ) {
      return {
        status: "not_found",
        message: error.message
      };
    }

    throw error;
  }
}

// Expose the function to the OpenAI Agents SDK.
export const checkCourseEligibilityTool = tool({
  name: "check_course_eligibility",

  description: `
    Check whether the authenticated student is eligible
    to take a specified NTU course.

    Uses existing Smart STARS academic validation:
    prerequisites, corequisites, programme restrictions,
    mutual exclusions and completed courses.

    Use this tool whenever a student asks whether
    they can take, select or qualify for a course.

    Distinguish can_select from eligible.
    Explain missing requirements and review flags.
    Never invent eligibility results.
  `,

  parameters: z.object({
    course_code: z.string().describe(
      "NTU course code, such as MH1811 or IE3012."
    )
  }),

  async execute({ course_code }, runContext) {
    console.log(
      "[AI TOOL] check_course_eligibility called:",
      course_code
    );

    // Student identity comes from trusted backend context.
    const studentId = runContext?.context?.studentId;

    // Future website integration can supply an authenticated
    // active planning request, if one is selected.
    const requestId =
      runContext?.context?.activeRequestId ?? null;

    const result = await loadCourseEligibility(
      studentId,
      course_code,
      requestId
    );

    return JSON.stringify(result);
  }
});
