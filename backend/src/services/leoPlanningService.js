const { randomUUID } = require("node:crypto");
const pool = require("../config/db");
const plans = require("./planService");
const preferences = require("./preferenceService");
const { validatePreferences } = require("./preferenceValidation");
const summaries = require("./planningSummaryService");
const { generatePlans } = require("./generationService");

// Only exact application-recognized commands authorize writes. A model-supplied
// confirmation boolean, quoted command or casual acknowledgement is insufficient.
function parsePlanningCommand(message) {
  if (typeof message !== "string") return null;
  let match = message.trim().match(/^CONFIRM ([a-f0-9-]{36}) FOR REQUEST ([1-9]\d*)( AND GENERATE)?$/i);
  if (match) return { action: "confirm", draft_id: match[1].toLowerCase(), request_id: Number(match[2]), generate: Boolean(match[3]) };
  match = message.trim().match(/^GENERATE REQUEST ([1-9]\d*)(?: FROM PLAN ([1-9]\d*))?$/i);
  return match ? { action: "generate", request_id: Number(match[1]), source_plan_id: match[2] ? Number(match[2]) : null } : null;
}
const payload = draft => ({ day_preferences: draft.day_preferences,
  time_preferences: draft.time_preferences.map(({ description, ...row }) => row), objectives: draft.objectives });
async function ownedConversation(db, studentId, conversationId, lock = false) {
  const [rows] = await db.query(`SELECT conversation_id FROM ai_conversation WHERE conversation_id = ? AND student_id = ?${lock ? " FOR UPDATE" : ""}`, [conversationId, studentId]);
  if (!rows.length) throw new plans.PlanningError(404, "Conversation not found for this student.");
}
async function stagePreferenceDraft(context, requestId, draft) {
  const { studentId, conversationId } = context;
  if (!studentId || !conversationId) throw new plans.PlanningError(401, "A student conversation is required to stage preferences");
  // Validate even ready model output using the authoritative persistence rules.
  const staged = structuredClone(draft);

  if (staged.status === "ready_for_confirmation") {
    try { validatePreferences(payload(staged)); }
    catch (error) { staged.status = "clarification_required"; staged.clarification_questions.push(error.message); }
  }
  return plans.transaction(async db => {
    await summaries.requireOwnedRequest(requestId, studentId, db, true);
    await ownedConversation(db, studentId, conversationId, true);
    if (staged.status === "no_preferences") {
      await db.query("DELETE FROM ai_preference_draft WHERE conversation_id = ?", [conversationId]);
      return { ...staged, request_id: Number(requestId), confirmation_command: null };
    }
    const draftId = randomUUID();
    await db.query(`INSERT INTO ai_preference_draft (conversation_id, draft_id, request_id, payload, status)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE draft_id = VALUES(draft_id), request_id = VALUES(request_id),
      payload = VALUES(payload), status = VALUES(status), saved_at = NULL`, [conversationId, draftId, requestId, JSON.stringify(staged), staged.status]);
    return { ...staged, draft_id: draftId, request_id: Number(requestId),
      confirmation_command: staged.status === "ready_for_confirmation" ? `CONFIRM ${draftId} FOR REQUEST ${requestId}` : null };
  });
}
async function readDraft(context) {
  await ownedConversation(pool, context.studentId, context.conversationId);
  const [rows] = await pool.query("SELECT draft_id, request_id, payload, status, saved_at FROM ai_preference_draft WHERE conversation_id = ?", [context.conversationId]);
  return rows[0] ?? null;
}
async function confirmPreferenceDraft(context, draftId, requestId) {
  const command = parsePlanningCommand(context.message);
  if (!command || command.action !== "confirm" || command.draft_id !== draftId || command.request_id !== Number(requestId)) {
    throw new plans.PlanningError(409, "Explicit draft/request confirmation is required", { code: "CONFIRMATION_REQUIRED" });
  }
  return plans.transaction(async db => {
    await summaries.requireOwnedRequest(requestId, context.studentId, db, true);
    await ownedConversation(db, context.studentId, context.conversationId, true);
    const [rows] = await db.query("SELECT * FROM ai_preference_draft WHERE conversation_id = ? FOR UPDATE", [context.conversationId]);
    const draft = rows[0];
    if (!draft || draft.draft_id !== draftId || draft.request_id !== Number(requestId)) throw new plans.PlanningError(409, "Draft was superseded or belongs to another request", { code: "STALE_DRAFT" });
    if (draft.status !== "ready_for_confirmation") throw new plans.PlanningError(409, "Draft requires clarification or has already been saved", { code: "DRAFT_NOT_READY" });
    const value = typeof draft.payload === "string" ? JSON.parse(draft.payload) : draft.payload;
    if (value.clarification_questions.length || value.status !== "ready_for_confirmation") throw new plans.PlanningError(409, "Clarification is still required");
    const saved = await preferences.replacePreferencesInTransaction(db, Number(requestId), payload(value));
    await db.query("UPDATE ai_preference_draft SET status = 'saved', saved_at = CURRENT_TIMESTAMP WHERE conversation_id = ?", [context.conversationId]);
    return { status: "saved", saved_to_database: true, draft_id: draftId, request_id: Number(requestId), preferences: saved };
  });
}
async function generateForStudent(context, requestId, sourcePlanId = null) {
  const command = parsePlanningCommand(context.message);
  if (!command || command.request_id !== Number(requestId) ||
      !(command.action === "generate" || command.action === "confirm" && command.generate) ||
      (command.action === "generate" ? command.source_plan_id !== sourcePlanId : sourcePlanId !== null)) {
    throw new plans.PlanningError(409, "Explicit generation command is required", { code: "CONFIRMATION_REQUIRED", command: `GENERATE REQUEST ${requestId}` });
  }
  if (command.action === "confirm") {
    const draft = await readDraft(context);
    if (!draft || draft.draft_id !== command.draft_id || draft.request_id !== command.request_id || draft.status !== "saved") throw new plans.PlanningError(409, "Confirm and save the draft before generation");
  }
  const result = await generatePlans(requestId, context.studentId, sourcePlanId === null ? {} : { source_plan_id: sourcePlanId });
  const detailed = [];
  for (const plan of result.plans) detailed.push(await summaries.getPlanSummary(plan.plan_id, context.studentId));
  return { ...result, plans: detailed, status: "generated", timetable_generated: true };
}
async function getPlanningContext(studentId, requestId) {
  await summaries.requireOwnedRequest(requestId, studentId);
  return { request: await plans.getRequest(requestId), preferences: await preferences.getPreferences(requestId, studentId),
    blocked_periods: (await preferences.getBlocks(requestId, studentId)).blocked_periods,
    plans: await summaries.getRequestPlanSummaries(requestId, studentId), active: await summaries.getActivePlan(requestId, studentId) };
}

// Resolve eligibility against an owned plan, never against the legacy
// planning_request_course selection. An omitted plan is only inferred when
// exactly one final plan is selected for the student (or supplied request).
async function resolveEligibilityPlan(studentId, requestId = null, planId = null) {
  if (!studentId) throw new plans.PlanningError(401, "Student identity required");
  if (requestId !== null) plans.integer(requestId, "requestId");
  if (planId !== null) plans.integer(planId, "planId");
  if (requestId !== null) await summaries.requireOwnedRequest(requestId, studentId);

  let selectedPlan = null;
  if (planId !== null) {
    const [rows] = await pool.query(
      `SELECT p.plan_id, p.request_id, p.plan_name, p.status
       FROM plan p
       JOIN planning_request pr ON pr.request_id = p.request_id
       WHERE p.plan_id = ? AND pr.student_id = ?`,
      [planId, studentId]
    );
    if (!rows.length || (requestId !== null && Number(rows[0].request_id) !== Number(requestId))) {
      throw new plans.PlanningError(404, "Plan not found for this student and request");
    }
    if (rows[0].status === "ARCHIVED") {
      throw new plans.PlanningError(409, "Archived plans are not current planning context");
    }
    selectedPlan = rows[0];
  } else {
    let requests;
    if (requestId !== null) {
      requests = [{ request_id: requestId }];
    } else {
      [requests] = await pool.query("SELECT request_id FROM planning_request WHERE student_id = ?", [studentId]);
    }
    const choices = [];
    for (const request of requests) {
      const active = await summaries.getActivePlan(request.request_id, studentId);
      if (active?.plan?.plan_id) choices.push({
        plan_id: active.plan.plan_id,
        request_id: request.request_id,
        plan_name: active.plan.plan_name,
        status: "SELECTED",
      });
    }
    if (choices.length > 1) {
      return { status: "clarification_required", message: "More than one selected timetable exists. Specify which plan to evaluate.", available_plans: choices };
    }
    selectedPlan = choices[0] ?? null;
  }

  if (!selectedPlan) {
    return { status: "completed_courses_only", request_id: requestId, plan_id: null,
      selected_course_codes: [], message: "No unambiguous selected plan was found; concurrent plan courses were not considered." };
  }
  const [courses] = await pool.query(
    "SELECT course_code FROM plan_selected_course WHERE plan_id = ? ORDER BY course_code",
    [selectedPlan.plan_id]
  );
  return { status: "plan_context", plan_id: selectedPlan.plan_id,
    plan_name: selectedPlan.plan_name, request_id: selectedPlan.request_id,
    plan_status: selectedPlan.status ?? null,
    selection_scope: planId !== null ? "explicit_plan" : "confirmed_plan",
    selected_course_codes: courses.map(row => row.course_code) };
}

function failure(error) {
  if (!(error instanceof plans.PlanningError)) throw error;
  return { status: "rejected", success: false, http_status: error.status, message: error.message, ...error.details };
}
module.exports = { parsePlanningCommand, stagePreferenceDraft, readDraft, confirmPreferenceDraft, generateForStudent, getPlanningContext, resolveEligibilityPlan, failure };
