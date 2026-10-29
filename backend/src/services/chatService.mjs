import "dotenv/config";
import { run } from "@openai/agents";
import {
  smartStarsAgent,
  preferenceDraftAgent
} from "../ai/smartStarsAgent.mjs";
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
  } else if (generation.status === "clarification_required") {
    lines.push(generation.message);
  } else if (generation.status === "rejected") {
    lines.push(generation.message);
    for (const reason of generation.reasons || []) lines.push(`${reason.code}: ${reason.explanation || reason.message || "Review this requirement."}`);
    for (const suggestion of generation.suggestions || []) lines.push(suggestion.explanation || suggestion.action);
  }
  return lines.join("\n").slice(0, 11000);
}

export function draftReply(draft) {
  const dayNames = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday"
  };

  const flexibility = {
    HARD: "strict requirement",
    SOFT: "flexible preference",
    UNSPECIFIED: "needs clarification"
  };

  const objectiveNames = {
    MINIMIZE_SCHOOL_DAYS: "Spend fewer days on campus",
    MINIMIZE_GAPS: "Have shorter breaks between classes"
  };

  const lines = [
    "Here's what I've understood about your timetable preferences:",
    ""
  ];

  for (const p of draft.day_preferences) {
    const action = p.preference_type === "AVOID"
      ? "Avoid classes on"
      : "Prefer classes on";

    lines.push(
      `• ${action} ${dayNames[p.day_of_week] ?? p.day_of_week} ` +
      `(${flexibility[p.constraint_level]}).`
    );
  }

  for (const p of draft.time_preferences) {
    const action = p.preference_type === "AVOID"
      ? "Avoid classes"
      : "Prefer classes";

    const timeDescription = p.start_time && p.end_time
      ? `between ${p.start_time} and ${p.end_time}`
      : `during ${p.description} (exact hours needed)`;

    lines.push(
      `• ${action} ${timeDescription} ` +
      `(${flexibility[p.constraint_level]}).`
    );
  }

  for (const p of draft.objectives) {
    const objective = objectiveNames[p.objective_type]
      ?? p.objective_type;

    const priority = p.priority === 1
      ? "highest priority"
      : `priority ${p.priority}`;

    lines.push(`• ${objective} (${priority}).`);
  }

  lines.push("", "I haven't saved anything yet.");

  const questions = draft.clarification_questions ?? [];

  if (questions.length > 0) {
    lines.push(
      "",
      "I just need to clarify a few things:",
      ...questions.map((question, index) =>
        `${index + 1}. ${question}`
      )
    );
  } else if (draft.confirmation_command) {
    lines.push(
      "",
      "Saving these preferences will replace your existing " +
      "day and time preferences and scheduling priorities. " +
      "Your blocked periods will remain unchanged.",
      "",
      'Would you like me to save these preferences? ' +
      'You can reply "Save these preferences" or tell me what to change.'
    );
  } else if (draft.binding_required) {
    lines.push(
      "",
      "Which academic year and semester should I use?"
    );
  }

  return lines.join("\n");
}

function isPreferenceEditMessage(message) {
  const text = message.trim().toLowerCase();

  // Questions requesting information should use the normal agent.
  if (/^(what|which|when|where|why|how|show|list|tell|display)\b/.test(text)) {
    return false;
  }

  const hasPreferenceIntent =
    /\b(set|change|update|edit|adjust|draft|prefer|preferences?|avoid|minimi[sz]e|fewer)\b/.test(text) ||
    /don['’]?t want|do not want|can['’]?t attend|cannot attend/.test(text);

  const hasTimetableContext =
    /\b(timetable|schedule|classes?|lectures?|tutorials?|campus|mornings?|afternoons?|evenings?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text);

  return hasPreferenceIntent && hasTimetableContext;
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
    // Recognize an explicit natural-language save request.
  const naturalSaveRequested =
    /^(?:yes,?\s+)?(?:please\s+)?save (?:these|my|the) preferences[.!]?$/i.test(cleaned);

  let commandText = cleaned;

  // Resolve the pending draft securely on the server.
  if (naturalSaveRequested && trusted) {
    const pendingDraft = await leo.readDraft(context);

    if (pendingDraft?.status === "ready_for_confirmation") {
      commandText =
        `CONFIRM ${pendingDraft.draft_id} FOR REQUEST ${pendingDraft.request_id}`;
    }
  }

  const command = leo.parsePlanningCommand(commandText);
  let reply, planningResult = null;

  if (naturalSaveRequested && !command) {
    reply =
      "I couldn't find a preference draft ready to save. " +
      "Tell me your preferences first, and I'll prepare one for your review.";

  } else if (command) {
    try {
      if (command.action === "confirm") {
        planningResult = await leo.confirmPreferenceDraft(
          { ...context, message: commandText },
          command.draft_id,
          command.request_id
        );
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
    const selectedAgent = isPreferenceEditMessage(cleaned)
      ? preferenceDraftAgent
      : smartStarsAgent;

    console.log(
      "[LEO ROUTER]",
      selectedAgent === preferenceDraftAgent
        ? "Preference interpreter"
        : "General assistant"
    );

    const result = await runAgent(
      selectedAgent,
      input,
      { context, maxTurns: 10 }
    );
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
