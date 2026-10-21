
import { tool } from "@openai/agents";
import { z } from "zod";
import summaries from "../../services/planningSummaryService.js";
import planService from "../../services/planService.js";

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

// OpenAI Agents SDK function tool.
export const getStudentTimetableTool = tool({
  name: "get_student_timetable",

  description: `
    Retrieve the authenticated student's selected weekly
    timetable, including courses, indexes, class types,
    weekdays, start/end times, venues, and teaching weeks.
    Use this for timetable and class-session questions.
  `,

  parameters: z.object({
    academic_year: z.string().nullable(),
    semester: z.number().int().nullable(),
    request_id: z.number().int().positive().nullable()
  }),

  async execute({ academic_year, semester, request_id }, runContext) {
    console.log("[AI TOOL] get_student_timetable called");

    const studentId = runContext?.context?.studentId;

    const result = await loadSelectedTimetable(
      studentId,
      academic_year,
      semester,
      request_id
    );

    return JSON.stringify(result);
  }
});
