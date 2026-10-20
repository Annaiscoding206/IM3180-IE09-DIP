
import { tool } from "@openai/agents";
import { z } from "zod";

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
  description: z.string(),
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
  day_preferences: z.array(dayPreferenceSchema),
  time_preferences: z.array(timePreferenceSchema),
  objectives: z.array(objectiveSchema),
  clarification_questions: z.array(z.string())
});

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Deterministic validation of AI-extracted preferences.
// This function does not access or modify the database.
export function buildPreferenceDraft(input) {
  const parsed = preferenceInputSchema.parse(input);

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

    Never invent an exact time range.
    If the student says "morning" or "afternoon"
    without specifying hours, use null for start_time
    and end_time and ask for clarification.

    If strictness is unclear, use UNSPECIFIED.
    Do not assume that "avoid" means HARD.

    Only extract preferences actually stated by the student.
    Do not invent preferences or objectives.

    For objectives, assign priority 1 when no relative
    importance is specified.

    This tool creates a DRAFT only.
    It does not save preferences or generate plans.
  `,

  parameters: preferenceInputSchema,

  async execute(input) {
    console.log(
      "[AI TOOL] interpret_timetable_preferences called"
    );

    const result = buildPreferenceDraft(input);

    return JSON.stringify(result);
  }
});
