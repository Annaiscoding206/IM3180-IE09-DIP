
import { tool } from "@openai/agents";
import { z } from "zod";
import leo from "../../services/leoPlanningService.js";
import planService from "../../services/planService.js";
// Supported by our existing Smart STARS database schema.
const dayCodes = [
  "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
];

const preferenceTypes = ["PREFER", "AVOID"];
const constraintLevels = ["HARD", "SOFT", "UNSPECIFIED"];

const dayPreferenceSchema = z.object({
  day_of_week: z.enum(dayCodes),
  preference_type: z.enum(preferenceTypes),
  constraint_level: z.enum(constraintLevels)
});

const timePreferenceSchema = z.object({
  description: z.string().max(200),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  preference_type: z.enum(preferenceTypes),
  constraint_level: z.enum(constraintLevels)
});

const objectiveSchema = z.object({
  objective_type: z.enum([
    "MINIMIZE_SCHOOL_DAYS",
    "MINIMIZE_GAPS"
  ]),
  priority: z.number().int().min(1)
});

const preferenceInputSchema = z.object({
  day_preferences: z.array(dayPreferenceSchema).max(14),
  time_preferences: z.array(timePreferenceSchema).max(14),
  objectives: z.array(objectiveSchema).max(2),
  clarification_questions: z.array(z.string().max(200)).max(10)
});

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Deterministic validation of AI-extracted preferences.
// This function does not access or modify the database.
export function buildPreferenceDraft(input) {
  const parsed = preferenceInputSchema.parse(input);

  // Normalize valid HH:MM:00 values to HH:MM.
  for (const preference of parsed.time_preferences) {
    for (const field of ["start_time", "end_time"]) {
      const value = preference[field];

      if (
        typeof value === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d:00$/.test(value)
      ) {
        preference[field] = value.slice(0, 5);
      }
    }
  }

  const questions = [
    ...parsed.clarification_questions
  ];

  for (const preference of parsed.day_preferences) {
    if (preference.constraint_level === "UNSPECIFIED") {
      questions.push(
        `Should avoiding or preferring ${preference.day_of_week} ` +
        "be a strict requirement or a flexible preference?"
      );
    }
  }

  for (const preference of parsed.time_preferences) {
    const {
      description,
      start_time,
      end_time,
      constraint_level
    } = preference;

    if (
      !start_time ||
      !end_time ||
      !timePattern.test(start_time) ||
      !timePattern.test(end_time) ||
      start_time >= end_time
    ) {
      questions.push(
        `What exact time range (HH:MM-HH:MM) ` +
        `do you mean by "${description}"?`
      );
    }

    if (constraint_level === "UNSPECIFIED") {
      questions.push(
        `Should "${description}" be a strict requirement ` +
        "or a flexible preference?"
      );
    }
  }

  const uniqueQuestions = [...new Set(questions)];

  const hasPreferences =
    parsed.day_preferences.length > 0 ||
    parsed.time_preferences.length > 0 ||
    parsed.objectives.length > 0;

  const status = !hasPreferences
    ? "no_preferences"
    : uniqueQuestions.length > 0
      ? "clarification_required"
      : "ready_for_confirmation";

  return {
    status,
    day_preferences: parsed.day_preferences,
    time_preferences: parsed.time_preferences,
    objectives: parsed.objectives,
    clarification_questions: uniqueQuestions,
    requires_student_confirmation: true,
    saved_to_database: false,
    timetable_generated: false
  };
}

// OpenAI Agents SDK tool.
export const interpretTimetablePreferencesTool = tool({
  name: "interpret_timetable_preferences",

  description: `
    Interpret a student's natural-language timetable preferences.

    Extract:
    - Preferred or avoided weekdays.
    - Preferred or avoided time ranges.
    - Planning objectives such as minimizing school days
      or minimizing timetable gaps.

    HARD means a mandatory constraint.
    SOFT means a flexible preference.
    UNSPECIFIED means the student's strictness is unclear.

    When the student explicitly uses preference language
    such as "I prefer", "I would prefer", or "I'd like",
    classify the preference as SOFT unless the student
    also specifies that it is mandatory.

    Use HARD when the student clearly states that
    something is compulsory, such as "I cannot attend",
    "I must avoid", or "absolutely no classes".

    Use UNSPECIFIED only when strictness is genuinely
    unclear, such as "I don't want Friday classes"
    without further explanation.

    Never invent an exact time range.
    If the student says "morning" or "afternoon"
    without specifying hours, use null for start_time
    and end_time and ask for clarification.

    The buildPreferenceDraft function automatically
    generates clarification questions for missing
    time ranges and unspecified constraint levels.

    Do not add these questions to clarification_questions
    yourself.

    Use clarification_questions only for other semantic
    ambiguities that deterministic validation cannot
    identify.

    If strictness is unclear, use UNSPECIFIED.
    Do not assume that "avoid" means HARD.

    Only extract preferences actually stated by the student.
    Do not invent preferences or objectives.

    For objectives, assign priority 1 when no relative
    importance is specified.

    When the student provides an academic year and semester,
    extract them into academic_year and semester.

    Do not invent a planning request ID.

    If request_id is unknown, pass null. The backend will
    automatically identify the student's matching request
    when there is exactly one match.

    If the request remains ambiguous, ask the student
    to clarify the academic term or planning request.When the student provides an academic year and semester,
    extract them into academic_year and semester.

    Do not invent a planning request ID.

    If request_id is unknown, pass null. The backend will
    automatically identify the student's matching request
    when there is exactly one match.

    If the request remains ambiguous, ask the student
    to clarify the academic term or planning request.
    It does not save preferences or generate plans.
  `,

parameters: preferenceInputSchema.extend({
  request_id: z.number().int().positive().nullable(),
  academic_year: z.string().nullable(),
  semester: z.number().int().positive().nullable()
}),

  async execute(input, runContext) {
  console.log("[AI TOOL] interpret_timetable_preferences called");

  let result = buildPreferenceDraft(input);

  const studentId = runContext?.context?.studentId;
  let requestId = input.request_id;

  try {
    const scope = await leo.toolPlanningScope(runContext?.context || {}, {
      requestId, academicYear: input.academic_year, semester: input.semester
    });
    requestId = scope.requestId;
    // Resolve a planning request from the authenticated student.
    if (requestId === null && studentId) {
      const requests = await planService.listRequests(studentId);

      const matchingRequests = requests.filter((request) =>
        (input.academic_year === null ||
          String(request.academic_year) === String(input.academic_year)) &&
        (input.semester === null ||
          Number(request.semester) === Number(input.semester))
      );

      // Automatically select only when there is one match.
      if (matchingRequests.length === 1) {
        requestId = Number(matchingRequests[0].request_id);
      }
    }

    if (requestId !== null && studentId) {
      result = await leo.stagePreferenceDraft(
        runContext.context,
        requestId,
        result
      );
    } else {
      result = {
        ...result,
        status: result.status === "no_preferences"
          ? "no_preferences"
          : "clarification_required",
        request_id: null,
        binding_required: true,
        clarification_questions: [
          ...result.clarification_questions,
          "Which academic year and semester should these preferences apply to?"
        ]
      };
    }
  } catch (error) {
    return JSON.stringify(leo.failure(error));
  }

  if (runContext?.context) {
    runContext.context.preferenceDraft = result;
  }

  return JSON.stringify(result);
}
});
