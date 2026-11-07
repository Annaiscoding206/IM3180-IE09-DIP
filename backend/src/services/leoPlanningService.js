const { resolvePlanContext, contextId } = require("./planContextService");
const { randomUUID } = require("node:crypto");
const pool = require("../config/db");
const plans = require("./planService");
const preferences = require("./preferenceService");
const { validatePreferences } = require("./preferenceValidation");
const summaries = require("./planningSummaryService");
const { generatePlans, regeneratePlan } = require("./generationService");

// Browser context is supplied separately from model arguments and verified
// before reading chat history or invoking tools. Telegram callers may omit it.
async function bindPlanningContext(studentId, requestId = null, planId = null) {
  if (requestId === null && planId === null) return {};
  if (!studentId) throw new plans.PlanningError(401, 'Student identity required');
  if (requestId === null) throw new plans.PlanningError(400, 'request_id is required with plan_id');
  const request = await summaries.requireOwnedRequest(contextId(requestId, 'request_id'), studentId);
  const plan = planId === null ? null : await resolvePlanContext(studentId, { request_id: request.request_id, plan_id: planId });
  return { activeRequestId: request.request_id, activePlanId: plan?.plan_id ?? null,
    planningTerm: { academic_year: request.academic_year, semester: request.semester } };
}

function scopedRequest(context, requestId = null) {
  if (context.activeRequestId != null && requestId != null && Number(requestId) !== Number(context.activeRequestId)) {
    throw new plans.PlanningError(409, 'Choose that planning term in the website before using its request.', { code: 'ACTIVE_REQUEST_MISMATCH' });
  }
  return context.activeRequestId ?? requestId;
}

async function toolPlanningScope(context, { requestId = null, planId = null, academicYear = null, semester = null } = {}) {
  const request = scopedRequest(context, requestId);
  if (context.activeRequestId != null &&
      ((academicYear !== null && academicYear !== context.planningTerm.academic_year) ||
       (semester !== null && Number(semester) !== Number(context.planningTerm.semester)))) {
    throw new plans.PlanningError(409, 'The requested term differs from the website Planning Term.', { code: 'ACTIVE_REQUEST_MISMATCH' });
  }
  const plan = planId ?? context.activePlanId ?? null;
  if (context.activeRequestId != null && plan !== null) {
    await resolvePlanContext(context.studentId, { request_id: request, plan_id: plan });
  }
  return { requestId: request, planId: plan,
    academicYear: context.planningTerm?.academic_year ?? academicYear,
    semester: context.planningTerm?.semester ?? semester };
}

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
  requestId = scopedRequest(context, requestId);
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
  requestId = scopedRequest(context, requestId);
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
  requestId = scopedRequest(context, requestId);
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
  const planningContext = await resolveEligibilityPlan(context.studentId, requestId, sourcePlanId ?? context.activePlanId ?? null);
  if (planningContext.status === 'clarification_required') return planningContext;
  const result = await generatePlans(requestId, context.studentId, { source_plan_id: planningContext.plan_id });
  const detailed = [];
  for (const plan of result.plans) detailed.push(await summaries.getPlanSummary(plan.plan_id, context.studentId));
  return { ...result, plans: detailed, status: "generated", timetable_generated: true };
}
async function getPlanningContext(studentId, requestId, planId = null) {
  const planningContext = await resolveEligibilityPlan(studentId, requestId, planId);
  if (planningContext.status === 'clarification_required') return planningContext;
  const plan = await summaries.getPlanSummary(planningContext.plan_id, studentId);
  return { request: await summaries.requireOwnedRequest(requestId, studentId),
    planning_context: planningContext, selected_courses: planningContext.selected_course_codes,
    preferences: await preferences.getPreferences(requestId, studentId),
    blocked_periods: plan.blocked_periods,
    plans: await summaries.getRequestPlanSummaries(requestId, studentId), active: await summaries.getActivePlan(requestId, studentId) };
}

// Leo resolves conversational ambiguity, then delegates all explicit ownership
// and selection loading to the shared backend resolver.
async function resolveEligibilityPlan(studentId, requestId = null, planId = null, db = pool) {
  if (planId !== null) return resolvePlanContext(studentId, {
    plan_id: planId, ...(requestId === null ? {} : { request_id: requestId }),
  }, db);
  if (!studentId) throw new plans.PlanningError(401, "Student identity required");
  const requests = requestId === null
    ? await plans.listRequests(studentId)
    : [await summaries.requireOwnedRequest(contextId(requestId, "request_id"), studentId)];
  const choices = [];
  for (const request of requests) {
    let active;
    try { active = await summaries.getActivePlan(request.request_id, studentId); }
    catch (error) {
      if (error.details?.code !== 'AMBIGUOUS_SELECTION') throw error;
      return { status: 'clarification_required', request_id: request.request_id,
        message: 'More than one confirmed plan exists. Specify the plan to evaluate.' };
    }
    if (active?.plan?.plan_id) choices.push(active.plan);
  }
  if (choices.length !== 1) return {
    status: "clarification_required",
    message: "Specify the plan to evaluate; no unique confirmed plan is available.",
    available_plans: choices.map(p => ({ plan_id: p.plan_id, request_id: p.request_id, plan_name: p.plan_name })),
  };
  return resolvePlanContext(studentId, { plan_id: choices[0].plan_id }, db);
}

function failure(error) {
  if (!(error instanceof plans.PlanningError)) throw error;
  return { status: "rejected", success: false, http_status: error.status, message: error.message, ...error.details };
}
async function regenerateNamedPlan(studentId, requestId, planLetter) {
  if (typeof studentId !== "string" || !studentId.trim()) {
    throw new plans.PlanningError(401, "Student identity required");
  }

  const letter = String(planLetter ?? "").trim().toUpperCase();

  if (!["A", "B", "C"].includes(letter)) {
    throw new plans.PlanningError(400, "Choose Plan A, B, or C.");
  }

  // Retrieve only plans belonging to the student's planning request.
  const availablePlans = await summaries.getRequestPlanSummaries(
    requestId,
    studentId
  );

  // Match names such as "AUTO Plan B #1".
  const namePattern = new RegExp(
    `(?:^|\\s)Plan\\s+${letter}(?=\\s|#|$)`,
    "i"
  );

  const matchingPlans = availablePlans
    .filter(plan =>
      String(plan.status).toUpperCase() === "GENERATED" &&
      !plan.active_selection &&
      namePattern.test(String(plan.plan_name ?? plan.label ?? ""))
    )
    .sort((a, b) => Number(b.plan_id) - Number(a.plan_id));

  if (!matchingPlans.length) {
    throw new plans.PlanningError(
      404,
      `No available Plan ${letter} was found for request ${requestId}.`
    );
  }

  const selectedPlan = matchingPlans[0];

  // Keyue's service verifies ownership again before making changes.
  const result = await regeneratePlan(
    selectedPlan.plan_id,
    studentId
  );

  return {
    ...result,
    plan_label: `Plan ${letter}`
  };
}
module.exports = {
  bindPlanningContext, scopedRequest, toolPlanningScope,
  parsePlanningCommand,
  stagePreferenceDraft,
  readDraft,
  confirmPreferenceDraft,
  generateForStudent,
  regeneratePlan,
  regenerateNamedPlan,
  getPlanningContext,
  resolveEligibilityPlan,
  failure
};
