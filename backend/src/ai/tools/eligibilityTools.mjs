import planContextService from "../../services/planContextService.js";
import { tool } from "@openai/agents";
import { z } from "zod";
import eligibilityService from "../../services/eligibilityService.js";
import leo from "../../services/leoPlanningService.js";
import plans from "../../services/planService.js";

// Retrieve eligibility from the existing backend service.
export async function loadCourseEligibility(
  studentId,
  courseCode,
  requestId = null,
  planId = null
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

  if (planId !== null && (!Number.isSafeInteger(planId) || planId <= 0)) {
    return { status: "invalid_plan_id", message: "Invalid timetable plan." };
  }

  try {
    // Only owned, explicit or uniquely confirmed plans can supply
    // concurrently selected courses; never read legacy request selections.
    return await planContextService.contextSnapshot(async db => {
      const planContext = await leo.resolveEligibilityPlan(studentId, requestId, planId, db);
      if (planContext.status === "clarification_required") return planContext;

      const result = await eligibilityService.evaluateEligibility(
        studentId,
        code,
        db,
        planContext.request_id,
        planContext.selected_course_codes
      );

      // Retrieve the actual prerequisite and corequisite
      // definitions from the existing database.
      const [requirements] = await db.query(
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
          planning_context: planContext,

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
    });

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

    // Owned-plan/request validation must not crash the agent or expose data.
    if (error instanceof plans.PlanningError) return leo.failure(error);

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

    For a specific draft plan, pass its verified plan_id.
    Otherwise use the uniquely confirmed plan; never guess a plan.
    Distinguish can_select from eligible.
    Explain missing requirements and review flags.
    Never invent eligibility results.
  `,

  parameters: z.object({
    course_code: z.string().describe(
      "NTU course code, such as MH1811 or IE3012."
    ),
    plan_id: z.number().int().positive().nullable().describe(
      "Plan ID when the student identifies a specific owned plan; otherwise null."
    )
  }),

  async execute({ course_code, plan_id }, runContext) {
    console.log(
      "[AI TOOL] check_course_eligibility called:",
      course_code
    );

    // Student identity comes from trusted backend context.
    const studentId = runContext?.context?.studentId;

    // Never infer courses from the request's legacy shared course list.
    const requestId =
      runContext?.context?.activeRequestId ?? null;

    let scope;
    try { scope = await leo.toolPlanningScope(runContext?.context || {}, { requestId, planId: plan_id }); }
    catch (error) { return JSON.stringify(leo.failure(error)); }
    const result = await loadCourseEligibility(
      studentId,
      course_code,
      scope.requestId,
      scope.planId
    );

    return JSON.stringify(result);
  }
});
