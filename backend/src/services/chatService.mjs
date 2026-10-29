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
    const options = [...(generation.plans ?? [])].sort(
      (a, b) => (a.rank_no ?? 999) - (b.rank_no ?? 999)
    );

    const dayNames = {
      MON: "Monday",
      TUE: "Tuesday",
      WED: "Wednesday",
      THU: "Thursday",
      FRI: "Friday",
      SAT: "Saturday",
      SUN: "Sunday"
    };

    const dayOrder = Object.keys(dayNames);

    lines.push(
      `I've generated ${options.length} timetable options for you.`,
      "None of them has been finalized. Let's review your choices."
    );

    for (const plan of options) {
      const days = [
        ...new Set(
          (plan.sessions ?? [])
            .map(session => session.day_of_week)
            .filter(Boolean)
        )
      ].sort(
        (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
      );

      const dayText =
        days.map(day => dayNames[day] ?? day).join(" and ") ||
        "days not available";

      const campusDays = plan.metrics?.campus_days ?? days.length;
      const gapMinutes = plan.metrics?.total_gap_minutes;

      lines.push(
        "",
        `${plan.label}:`,
        `You'll have classes on ${dayText}.`,
        `That's ${campusDays} day(s) on campus` +
          (gapMinutes != null
            ? `, with ${gapMinutes} minutes of gaps between classes.`
            : ".")
      );

      if (plan.validation?.can_finalize === false) {
        lines.push(
          "This option needs further review before it can be finalized."
        );
      }
    }

    if (options.length > 1) {
      const first = options[0];

      const tied = options.every(plan =>
        Number(plan.match_score) === Number(first.match_score) &&
        plan.metrics?.campus_days === first.metrics?.campus_days &&
        plan.metrics?.total_gap_minutes ===
          first.metrics?.total_gap_minutes
      );

      lines.push(
        "",
        "My recommendation:"
      );

      if (tied) {
        lines.push(
          "These options have the same overall score, number of campus days " +
          "and gap time. The best choice depends on which class days " +
          "and times you prefer."
        );
      } else {
        lines.push(
          `${first.label} is currently ranked highest by the planner. ` +
          "However, I recommend reviewing its class times before deciding."
        );
      }
    }

    lines.push(
      "",
      "Would you like me to compare the class times or show " +
      "one of these plans in more detail?"
    );
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

function isTimetableGenerationRequest(message) {
  const text = message.trim().toLowerCase();

  // Questions about generation are not generation requests.
  if (/^(how|what|why|when|where|which|explain)\b/.test(text)) {
    return false;
  }

  // Do not trigger generation when the student explicitly says not to.
  if (
    /\b(?:don't|dont|do not|not|never)\s+(?:\w+\s+){0,3}(?:generate|regenerate)\b/.test(text)
  ) {
    return false;
  }

  const hasGenerationIntent =
    /\b(generate|regenerate)\b/.test(text);

  const hasTimetableContext =
    /\b(timetables?|schedules?|plans?|options?)\b/.test(text);

  return hasGenerationIntent && hasTimetableContext;
}

function isPreferenceEditMessage(message) {
  const text = message.trim().toLowerCase();

  // Generation requests must not be interpreted as preference edits.
  if (isTimetableGenerationRequest(message)) {
    return false;
  }

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
function formatCurrentPlanComparison(allPlans, requestId) {
  const lines = [
    `Here's the current comparison for planning request ${requestId}:`
  ];

  const compared = [];

  for (const letter of ["A", "B", "C"]) {
    const plan = allPlans
      .filter(
        (p) =>
          String(p.status).toUpperCase() !== "ARCHIVED" &&
          p.label === `Plan ${letter}`
      )
      .sort((a, b) => Number(b.plan_id) - Number(a.plan_id))[0];

    if (!plan) {
      lines.push(`Plan ${letter}: No available plan found.`);
      continue;
    }

    const selected = [...(plan.selected_courses ?? [])]
      .map(String)
      .sort();

    const assigned = new Set(
      (plan.indexes ?? []).map((index) => String(index.course_code))
    );

    const unscheduled = selected.filter(
      (code) => !assigned.has(code)
    );

    const unselectedIndexes = [...assigned].filter(
      (code) => !selected.includes(code)
    );

    const complete =
      selected.length > 0 &&
      unscheduled.length === 0 &&
      unselectedIndexes.length === 0 &&
      plan.validation?.can_finalize === true &&
      plan.metrics != null;

    lines.push(
      `Plan ${letter} (ID ${plan.plan_id}): ` +
      `Selected courses: ${selected.join(", ") || "None"}.`
    );

    if (unscheduled.length) {
      lines.push(
        `Selected but not scheduled: ${unscheduled.join(", ")}.`
      );
    }

    if (unselectedIndexes.length) {
      lines.push(
        `Scheduled but not selected: ${unselectedIndexes.join(", ")}.`
      );
    }

    if (complete) {
      lines.push(
        `${plan.metrics.campus_days} campus day(s), ` +
        `${plan.metrics.total_gap_minutes} minutes of gaps.`
      );
    } else {
      lines.push(
        "This timetable is incomplete or requires validation. " +
        "Its campus-day and gap totals should not be used for ranking."
      );
    }

    compared.push({
      letter,
      selectedKey: selected.join("|"),
      complete,
      days: Number(plan.metrics?.campus_days),
      gaps: Number(plan.metrics?.total_gap_minutes)
    });
  }

  const sameCourses =
    compared.length === 3 &&
    new Set(compared.map((p) => p.selectedKey)).size === 1;

  const allComplete =
    compared.length === 3 &&
    compared.every(
      (p) =>
        p.complete &&
        Number.isFinite(p.days) &&
        Number.isFinite(p.gaps)
    );

  if (!sameCourses) {
    lines.push(
      "These plans have different selected courses or some plans " +
      "are unavailable. Their campus days and gaps cannot be " +
      "compared fairly as equivalent options."
    );
  } else if (!allComplete) {
    lines.push(
      "At least one timetable is incomplete or requires review. " +
      "Please resolve that before choosing the best plan."
    );
  } else {
    const ranked = [...compared].sort(
      (a, b) => a.days - b.days || a.gaps - b.gaps
    );

    lines.push(
      `Based on fewer campus days and shorter gaps, ` +
      `Plan ${ranked[0].letter} is preferable. ` +
      "Other scheduling preferences may change this recommendation."
    );
  }

  lines.push("No plan has been selected or finalized.");

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
  // Convert explicit natural-language generation requests
  // into commands recognized by the planning backend.
  if (
    trusted &&
    isTimetableGenerationRequest(cleaned) &&
    /\bgenerate\b/i.test(cleaned) &&
    !/\bregenerate\b/i.test(cleaned)
  ) {
    const requestMatch = cleaned.match(
      /\b(?:planning\s+)?request(?:\s+id)?\s*#?\s*([1-9]\d*)\b/i
    );

    if (requestMatch) {
      // Detect an explicitly referenced source plan.
      const sourcePlanMatch = cleaned.match(
        /\b(?:from|using|based on)\s+(?:my\s+)?plan\s*#?\s*([1-9]\d*)\b/i
      );

      commandText = sourcePlanMatch
        ? `GENERATE REQUEST ${requestMatch[1]} FROM PLAN ${sourcePlanMatch[1]}`
        : `GENERATE REQUEST ${requestMatch[1]}`;

      console.log("[LEO ROUTER] Timetable generation:", commandText);
    }
  }
  // Recognize explicit natural-language regeneration requests.
  const regenerationMatch = cleaned.match(
    /^(?:leo[,!]?\s*)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?regenerate\s+plan\s+([ABC])\s+for\s+(?:planning\s+)?request\s+([1-9]\d*)[.!]?$/i
  );
  // Recognize explicit requests to compare Plans A, B, and C.
  const comparisonRequestMatch =
    /\bcompar(?:e|ison)\b/i.test(cleaned) &&
    /\bplans?\s+A\b/i.test(cleaned) &&
    /\bB\b/i.test(cleaned) &&
    /\bC\b/i.test(cleaned)
      ? cleaned.match(
          /\b(?:planning\s+)?request(?:\s+id)?\s*#?\s*([1-9]\d*)\b/i
        )
      : null;
  const command = leo.parsePlanningCommand(commandText);
  let reply, planningResult = null;

  if (comparisonRequestMatch) {
    const requestId = Number(comparisonRequestMatch[1]);

    if (!trusted) {
      reply = "Please sign in before comparing your timetable options.";
    } else {
      console.log(
        "[LEO ROUTER] Compare Plans A/B/C for request",
        requestId
      );

      try {
        // Retrieve the latest student-owned plan summaries.
        const currentPlanning = await leo.getPlanningContext(
          trusted,
          requestId
        );

        reply = formatCurrentPlanComparison(
          currentPlanning.plans,
          requestId
        );
      } catch (error) {
        planningResult = leo.failure(error);
        reply =
          actionReply(planningResult) ||
          "I couldn't retrieve the current plans. Please try again.";
      }
    }
  } else if (regenerationMatch) {
    const planLetter = regenerationMatch[1].toUpperCase();
    const requestId = Number(regenerationMatch[2]);

    if (!trusted) {
      reply = "Please sign in before regenerating a timetable.";
    } else {
      console.log(
        "[LEO ROUTER] Regenerate Plan",
        planLetter,
        "for request",
        requestId
      );

      try {
        planningResult = await leo.regenerateNamedPlan(
          trusted,
          requestId,
          planLetter
        );

        const metrics = planningResult.metrics ?? {};

        reply = [
          `I've regenerated Plan ${planLetter} for planning request ${requestId}.`,
          metrics.campus_days != null
            ? `The timetable currently requires ${metrics.campus_days} campus day(s).`
            : null,
          metrics.total_gap_minutes != null
            ? `It has ${metrics.total_gap_minutes} minutes of gaps between classes.`
            : null,
          "I haven't finalized this plan.",
          "Would you like me to show you the updated class times?"
        ]
          .filter(Boolean)
          .join(" ");

      } catch (error) {
        planningResult = leo.failure(error);
        reply = actionReply(planningResult);
      }
    }

  } else if (naturalSaveRequested && !command) {
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
      } else {
        planningResult = await leo.generateForStudent(
          { ...context, message: commandText },
          command.request_id,
          command.source_plan_id
        );
      }
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
