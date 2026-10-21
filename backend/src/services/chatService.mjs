import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "../ai/smartStarsAgent.mjs";
import { createConversation, getConversationMessages, saveConversationTurn } from "./conversationService.mjs";
import leo from "./leoPlanningService.js";

function actionReply(result) {
  const lines = [];
  if (result.saved_to_database) lines.push(`Preferences saved to planning request ${result.request_id}.`);
  const generation = result.generation ?? result;
  if (generation.timetable_generated) {
    lines.push(`Generated ${generation.plans.length} validated timetable option(s). None is finalized automatically.`);
    for (const plan of generation.plans) {
      lines.push(`${plan.label}: plan ${plan.plan_id}, rank ${plan.rank_no}, score ${plan.match_score}; ${plan.metrics?.campus_days} campus days, ${plan.metrics?.total_gap_minutes} gap minutes. Indexes: ${plan.indexes.map(i => `${i.course_code}/${i.index_no}`).join(", ")}.`);
      lines.push(`Validation: ${plan.validation.can_finalize ? "ready to finalize" : "requires review"}.`);
      for (const slot of plan.sessions) lines.push(`  ${slot.course_code}/${slot.index_no} ${slot.class_type}: ${slot.day_of_week} ${slot.start_time}–${slot.end_time}, weeks ${slot.teaching_weeks ?? "unspecified"}${slot.venue ? `, ${slot.venue}` : ""}.`);
    }
  } else if (generation.status === "rejected") {
    lines.push(generation.message);
    for (const reason of generation.reasons || []) lines.push(`${reason.code}: ${reason.explanation || reason.message || "Review this requirement."}`);
    for (const suggestion of generation.suggestions || []) lines.push(suggestion.explanation || suggestion.action);
  }
  return lines.join("\n").slice(0, 11000);
}
export function draftReply(draft) {
  const lines = [`Preference draft${draft.request_id ? ` for request ${draft.request_id}` : " (choose a planning request)"}. Saved planning preferences are unchanged.`,
    "Confirming replaces all saved day preferences, time preferences and objectives. Blocked periods are unchanged."];
  for (const p of draft.day_preferences) lines.push(`${p.constraint_level} ${p.preference_type}: ${p.day_of_week}`);
  for (const p of draft.time_preferences) lines.push(`${p.constraint_level} ${p.preference_type}: ${p.start_time ?? "?"}–${p.end_time ?? "?"} (${p.description})`);
  for (const p of draft.objectives) lines.push(`${p.objective_type}: priority ${p.priority}`);
  lines.push(...draft.clarification_questions);
  if (draft.confirmation_command) lines.push(`To save this exact draft, send:\n${draft.confirmation_command}\nAppend AND GENERATE to generate after saving.`);
  return lines.join("\n");
}

// Shared website/Telegram entry point. Injectable runner is server-side only and
// makes deterministic integration tests possible without external model calls.
export async function askSmartStars({ message, studentId = null, conversationId = null, sourceChannel = "website" }, { runAgent = run } = {}) {
  if (typeof message !== "string" || !message.trim() || message.trim().length > 2000) throw new TypeError("Message must contain 1–2000 characters.");
  const cleaned = message.trim(), trusted = typeof studentId === "string" && studentId.trim() ? studentId.trim() : null;
  if (conversationId !== null && !trusted) throw Error("Authentication is required to access conversation history.");
  if (conversationId !== null && (!Number.isSafeInteger(conversationId) || conversationId <= 0)) throw TypeError("Invalid conversation ID.");
  if (!["website", "telegram"].includes(sourceChannel)) throw TypeError("Invalid source channel.");
  let previous = [];
  if (conversationId !== null) {
    previous = await getConversationMessages({ studentId: trusted, conversationId, limit: 30 });
    if (previous === null) throw Error("Conversation not found for this student.");
  } else if (trusted) {
    // Tools require a durable owned conversation before they stage a draft.
    conversationId = (await createConversation({ studentId: trusted, title: cleaned.slice(0, 100) })).conversation_id;
  }
  const context = { studentId: trusted, conversationId, message: cleaned };
  const command = leo.parsePlanningCommand(cleaned);
  let reply, planningResult = null;
  if (command) {
    try {
      if (command.action === "confirm") {
        planningResult = await leo.confirmPreferenceDraft(context, command.draft_id, command.request_id);
        if (command.generate) {
          try { planningResult.generation = await leo.generateForStudent(context, command.request_id); }
          catch (error) { planningResult.generation = leo.failure(error); }
        }
      } else planningResult = await leo.generateForStudent(context, command.request_id, command.source_plan_id);
    } catch (error) { planningResult = leo.failure(error); }
    reply = actionReply(planningResult);
  } else {
    const input = previous.map(item => ({ role: item.role, content: [{ type: item.role === "assistant" ? "output_text" : "input_text", text: item.content }] }));
    input.push({ role: "user", content: [{ type: "input_text", text: cleaned }] });
    const result = await runAgent(smartStarsAgent, input, { context, maxTurns: 10 });
    // Render staged drafts ourselves: the confirmation must cover the exact
    // persisted payload even if the model omits a field in its prose summary.
    reply = context.preferenceDraft ? draftReply(context.preferenceDraft) : result.finalOutput;
  }
  if (typeof reply !== "string" || !reply.trim()) throw Error("Smart STARS did not return a valid response.");
  const response = { success: true, reply: reply.trim(), ...(planningResult ? { planning_result: planningResult } : {}),
    ...(context.preferenceDraft ? { preference_draft: context.preferenceDraft } : {}) };
  if (!trusted) return response;
  const saved = await saveConversationTurn({ studentId: trusted, conversationId, title: cleaned.slice(0, 100), userMessage: cleaned,
    assistantMessage: reply.trim(), sourceChannel });
  return { ...response, conversation_id: saved.conversation_id };
}
