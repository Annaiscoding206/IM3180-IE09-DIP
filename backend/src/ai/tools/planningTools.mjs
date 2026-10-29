import { tool } from "@openai/agents";
import { z } from "zod";
import pool from "../../config/db.js";
import plans from "../../services/planService.js";
import audit from "../../services/degreeAuditService.js";
import curriculum from "../../services/curriculumService.js";
import leo from "../../services/leoPlanningService.js";

const wrap = fn => async (input, runContext) => {
  try {
    if (!runContext?.context?.studentId) throw new plans.PlanningError(401, "Student identity required");
    return JSON.stringify(await fn(input, runContext.context));
  } catch (error) { return JSON.stringify(leo.failure(error)); }
};
export const getAcademicContextTool = tool({
  name: "get_student_academic_context", description: "Retrieve the trusted student's profile, authoritative Degree Audit, or curriculum progress. For curriculum, pass the explicitly identified plan_id, or null to use a unique confirmed plan; ask for clarification if none is unambiguous. Profile and Degree Audit remain student-wide. Never infer identity from tool arguments.",
  parameters: z.object({ section: z.enum(["profile", "degree_audit", "curriculum"]), plan_id: z.number().int().positive().nullable() }),
  execute: wrap(async ({ section, plan_id }, context) => {
    const { studentId } = context;
    if (section === "degree_audit") return audit.getDegreeAudit(studentId, studentId);
    if (section === "curriculum") {
      const planningContext = await leo.resolveEligibilityPlan(studentId, context.activeRequestId ?? null, plan_id ?? null);
      if (planningContext.status === 'clarification_required') return planningContext;
      return curriculum.getStudentCurriculum(studentId, studentId, { plan_id: planningContext.plan_id });
    }
    const [students] = await pool.query("SELECT student_id, student_name, programme, study_year, admission_year, admission_route FROM student WHERE student_id = ?", [studentId]);
    if (!students.length) throw new plans.PlanningError(404, "Student not found");
    return { ...students[0], degree_audit_summary: await audit.getCompletionSummary(studentId), curriculum_progress: await curriculum.getCurriculumOverview(studentId) };
  })
});
export const listPlanningRequestsTool = tool({ name: "list_planning_requests", description: "List the trusted student's planning requests so the student can explicitly choose a request ID.",
  parameters: z.object({}), execute: wrap((_, context) => plans.listRequests(context.studentId)) });
export const getPlanningContextTool = tool({ name: "get_planning_context", description: "Read an owned request's shared preferences and the specified plan's selected courses and blocks, plus plan summaries. Pass plan_id for a draft; null uses a unique confirmed plan or asks for clarification. Never treat legacy request selections or blocks as plan context.",
  parameters: z.object({ request_id: z.number().int().positive(), plan_id: z.number().int().positive().nullable() }),
  execute: wrap(({ request_id, plan_id }, context) => leo.getPlanningContext(context.studentId, request_id, plan_id)) });
export const saveConfirmedPreferencesTool = tool({ name: "save_confirmed_preferences", description: "Save the exact stored draft only when the current user's message is the explicit CONFIRM draft-id FOR REQUEST request-id command. Never pass a model-inferred confirmation.",
  parameters: z.object({ draft_id: z.string(), request_id: z.number().int().positive() }),
  execute: wrap(({ draft_id, request_id }, context) => leo.confirmPreferenceDraft(context, draft_id, request_id)) });
export const generateTimetableTool = tool({ name: "generate_timetable_plans", description: "Invoke shared generation for an explicitly authorized request. If confirmation is required, present GENERATE REQUEST id, optionally FROM PLAN id to preserve locks. Return structured failures unchanged.",
  parameters: z.object({ request_id: z.number().int().positive(), source_plan_id: z.number().int().positive().nullable() }),
  execute: wrap(({ request_id, source_plan_id }, context) => leo.generateForStudent(context, request_id, source_plan_id)) });
export const planningTools = [getAcademicContextTool, listPlanningRequestsTool, getPlanningContextTool, saveConfirmedPreferencesTool, generateTimetableTool];
