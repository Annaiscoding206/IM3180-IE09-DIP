
import { tool } from "@openai/agents";
import { z } from "zod";
import summaries from "../../services/planningSummaryService.js";
import planService from "../../services/planService.js";
import leo from "../../services/leoPlanningService.js";

// Retrieve the student's selected timetable.
// The student ID must come from trusted application context,
// not from an AI-generated tool argument.
export async function loadSelectedTimetable(
  studentId,
  academicYear = null,
  semester = null,
  requestId = null
) {
  if (!studentId) {
    return {
      status: "authentication_required",
      message: "Student identity is required."
    };
  }

  // Step 1: Find planning requests for this student.
  const requests = await planService.listRequests(studentId);

  // Step 2: Filter by the requested academic term.
  const matchingRequests = requests.filter((request) => {
    const yearMatches =
      academicYear === null ||
      String(request.academic_year) === String(academicYear);

    const semesterMatches =
      semester === null ||
      String(request.semester) === String(semester);

    return yearMatches && semesterMatches && (requestId === null || request.request_id === requestId);
  });

  if (matchingRequests.length === 0) {
    return {
      status: "no_planning_request",
      message: "No planning request was found for this term."
    };
  }

  const selectedPlans = [];
  const stale = [];
  for (const request of matchingRequests) {
    const active = await summaries.getActivePlan(request.request_id, studentId);
    stale.push(...active.stale_plan_ids);
    if (active.plan) selectedPlans.push({ request, plan: active.plan });
  }
  if (!selectedPlans.length) return { status: "no_selected_plan", stale_plan_ids: stale, message: "No currently valid finalized timetable exists in this scope." };
  if (selectedPlans.length > 1) return { status: "clarification_required", message: "Specify the planning request ID; more than one active timetable matches.",
    available_requests: selectedPlans.map(({ request }) => ({ request_id: request.request_id, academic_year: request.academic_year, semester: request.semester })) };
  const { request, plan } = selectedPlans[0];
  return { request_id: request.request_id, academic_year: request.academic_year, semester: request.semester,
    ...plan, plan_status: plan.status, status: "ok", missing_slot_indexes: plan.validation.timetable.missing_slot_indexes, timetable_complete: plan.validation.can_finalize, weekly_schedule_only: true, count: plan.sessions.length };

}
// Retrieve a specific timetable plan belonging to the student.
// This does not modify or confirm the plan.
export async function loadPlanTimetable(studentId, planId) {
  if (!studentId) {
    return {
      status: "authentication_required",
      message: "Student identity is required."
    };
  }

  if (!Number.isSafeInteger(planId) || planId <= 0) {
    return {
      status: "invalid_plan_id",
      message: "Please provide a valid plan ID."
    };
  }

  try {
    // The summary service verifies that the student owns this plan.
    const plan = await summaries.getPlanSummary(planId, studentId);

    const requests = await planService.listRequests(studentId);

    const request = requests.find(
      (item) => Number(item.request_id) === Number(plan.request_id)
    );

    if (!request) {
      return {
        status: "plan_not_found",
        message: "Plan not found for this student."
      };
    }

    return {
      ...plan,
      status: "ok",
      plan_status: plan.status,
      request_id: request.request_id,
      academic_year: request.academic_year,
      semester: request.semester,
      is_confirmed: Boolean(plan.active_selection),
      weekly_schedule_only: true,
      count: plan.sessions.length
    };
  } catch (error) {
    if (
      error instanceof planService.PlanningError &&
      error.status === 404
    ) {
      return {
        status: "plan_not_found",
        message: "Plan not found for this student."
      };
    }

    throw error;
  }
}
export async function loadLatestNamedPlanTimetable(
  studentId,
  planLabel,
  academicYear = null,
  semester = null,
  requestId = null
) {
  if (!studentId) {
    return {
      status: "authentication_required",
      message: "Student identity is required."
    };
  }

  const letter = String(planLabel ?? "").trim().toUpperCase();

  if (!["A", "B", "C"].includes(letter)) {
    return {
      status: "invalid_plan_label",
      message: "Plan label must be A, B, or C."
    };
  }

  // Only search planning requests belonging to this student.
  const requests = await planService.listRequests(studentId);

  const matchingRequests = requests.filter((request) =>
    (academicYear === null ||
      String(request.academic_year) === String(academicYear)) &&
    (semester === null ||
      Number(request.semester) === Number(semester)) &&
    (requestId === null ||
      Number(request.request_id) === Number(requestId))
  );

  if (matchingRequests.length !== 1) {
    return {
      status: matchingRequests.length === 0
        ? "no_planning_request"
        : "clarification_required",
      message: matchingRequests.length === 0
        ? "No matching planning request was found."
        : "Please specify the academic year, semester, or request.",
      available_requests: matchingRequests.map((request) => ({
        request_id: request.request_id,
        academic_year: request.academic_year,
        semester: request.semester
      }))
    };
  }

  const request = matchingRequests[0];

  // Retrieve plans only from this student's matching request.
  const plans = await planService.listPlans(request.request_id);

  const namePattern = new RegExp(
    `(?:^|\\s)Plan\\s+${letter}(?=\\s|#|$)`,
    "i"
  );

  // Ignore archived plans and select the highest plan_id.
  const latestPlan = plans
    .filter((plan) =>
      String(plan.status).toUpperCase() !== "ARCHIVED" &&
      namePattern.test(String(plan.plan_name ?? ""))
    )
    .sort((a, b) => Number(b.plan_id) - Number(a.plan_id))[0];

  if (!latestPlan) {
    return {
      status: "plan_not_found",
      message: `No non-archived Plan ${letter} was found.`
    };
  }

  const timetable = await loadPlanTimetable(
    studentId,
    Number(latestPlan.plan_id)
  );

  return {
    ...timetable,
    requested_plan: `Plan ${letter}`,
    chosen_by: "latest_non_archived"
  };
}
// OpenAI Agents SDK function tool.
export const getStudentTimetableTool = tool({
  name: "get_student_timetable",

  description: `
    Retrieve the authenticated student's weekly timetable,
    including courses, indexes, class types, weekdays,
    start/end times, venues, and teaching weeks.

    If plan_id is provided, retrieve that specific plan,
    even if it has not been confirmed.

    If plan_label is A, B, or C and plan_id is null,
    automatically retrieve the latest non-archived
    matching plan for the requested academic term.

    A generated plan does not need to be confirmed
    or selected before its timetable can be viewed.

    If both plan_id and plan_label are null, retrieve
    the currently confirmed timetable.

    Use this for timetable and class-session questions.
    Never invent a plan ID.
  `,

  parameters: z.object({
    academic_year: z.string().nullable(),
    semester: z.number().int().nullable(),
    request_id: z.number().int().positive().nullable(),
    plan_id: z.number().int().positive().nullable(),
    plan_label: z.enum(["A", "B", "C"]).nullable()
  }),

  async execute(
    { academic_year, semester, request_id, plan_id, plan_label },
    runContext
  ) {
    console.log("[AI TOOL] get_student_timetable called", {
      academic_year,
      semester,
      request_id,
      plan_id,
      plan_label
    });

    const studentId = runContext?.context?.studentId;

    try {
      const scope = await leo.toolPlanningScope(runContext?.context || {}, {
        requestId: request_id, planId: plan_id, academicYear: academic_year, semester
      });
      request_id = scope.requestId;
      academic_year = scope.academicYear;
      semester = scope.semester;
      // Preserve selected/named timetable semantics; only an explicit plan ID
      // chooses a draft timetable here, as before.
    } catch (error) { return JSON.stringify(leo.failure(error)); }

    let result;

    if (plan_id !== null && plan_id !== undefined) {
      // Explicit plan ID takes priority.
      result = await loadPlanTimetable(studentId, plan_id);

    } else if (plan_label !== null && plan_label !== undefined) {
      // Automatically resolve the latest non-archived Plan A/B/C.
      result = await loadLatestNamedPlanTimetable(
        studentId,
        plan_label,
        academic_year,
        semester,
        request_id
      );

    } else {
      // Default: retrieve the currently selected timetable.
      result = await loadSelectedTimetable(
        studentId,
        academic_year,
        semester,
        request_id
      );
    }

    return JSON.stringify(result);
  }
});
