
import { tool } from "@openai/agents";
import { z } from "zod";
import planService from "../../services/planService.js";

// Retrieve the student's selected timetable.
// The student ID must come from trusted application context,
// not from an AI-generated tool argument.
export async function loadSelectedTimetable(
  studentId,
  academicYear = null,
  semester = null
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

    return yearMatches && semesterMatches;
  });

  if (matchingRequests.length === 0) {
    return {
      status: "no_planning_request",
      message: "No planning request was found for this term."
    };
  }

  // Step 3: Identify SELECTED plans.
  const selectedPlans = [];

  for (const request of matchingRequests) {
    const plans = await planService.listPlans(request.request_id);

    for (const plan of plans) {
      if (plan.status === "SELECTED") {
        selectedPlans.push({ request, plan });
      }
    }
  }

  if (selectedPlans.length === 0) {
    return {
      status: "no_selected_plan",
      message: "No finalized plan is selected for this term."
    };
  }

  if (selectedPlans.length > 1) {
    return {
      status: "clarification_required",
      message: "Please specify the academic year and semester.",
      available_terms: selectedPlans.map(({ request }) => ({
        academic_year: request.academic_year,
        semester: request.semester
      }))
    };
  }

  const { request, plan } = selectedPlans[0];

  // Step 4: Double-check plan ownership.
  const verifiedPlan = await planService.getPlan(plan.plan_id);

  if (String(verifiedPlan.student_id) !== String(studentId)) {
    throw new Error("Plan ownership verification failed.");
  }

  // Step 5: Reuse the existing timetable endpoint.
  // This is a local development adapter, not a public URL.
  const port = process.env.PORT || 5000;

  const response = await fetch(
    `http://127.0.0.1:${port}/api/plans/${plan.plan_id}/timetable`,
    { signal: AbortSignal.timeout(5000) }
  );

  if (!response.ok) {
    throw new Error(
      `Timetable API failed with status ${response.status}`
    );
  }

  const timetable = await response.json();

  if (timetable.success !== true) {
    throw new Error("Timetable retrieval was unsuccessful.");
  }

  return {
    status: timetable.timetable_complete ? "ok" : "incomplete",
    academic_year: request.academic_year,
    semester: request.semester,
    plan_id: plan.plan_id,
    plan_name: plan.plan_name,
    timetable_complete: timetable.timetable_complete,
    missing_slot_indexes: timetable.missing_slot_indexes,
    count: timetable.count,
    weekly_schedule_only: true,
    sessions: timetable.data
  };
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
    semester: z.number().int().nullable()
  }),

  async execute({ academic_year, semester }, runContext) {
    console.log("[AI TOOL] get_student_timetable called");

    const studentId = runContext?.context?.studentId;

    const result = await loadSelectedTimetable(
      studentId,
      academic_year,
      semester
    );

    return JSON.stringify(result);
  }
});
