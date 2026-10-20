const { PlanningError } = require("./planningError");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TYPES = ["PREFER", "AVOID"];
const LEVELS = ["HARD", "SOFT"];
const OBJECTIVES = ["MINIMIZE_SCHOOL_DAYS", "MINIMIZE_GAPS"];

function fields(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(value, key))) {
    throw new PlanningError(400, `${label} must contain exactly: ${keys.join(", ")}`);
  }
}

function member(value, choices, label) {
  if (!choices.includes(value)) throw new PlanningError(400, `${label} must be one of: ${choices.join(", ")}`);
  return value;
}

function normalizeTime(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new PlanningError(400, "Times must use HH:MM or HH:MM:SS within one day");
  }
  return value.length === 5 ? `${value}:00` : value;
}

function timeRange(row) {
  const start_time = normalizeTime(row.start_time);
  const end_time = normalizeTime(row.end_time);
  if (end_time <= start_time) throw new PlanningError(400, "end_time must be later than start_time");
  return { start_time, end_time };
}

function collection(rows, normalize, key, label) {
  if (!Array.isArray(rows)) throw new PlanningError(400, `${label} must be an array`);
  const normalized = rows.map(normalize);
  const keys = normalized.map(key);
  if (new Set(keys).size !== keys.length) throw new PlanningError(400, `Duplicate ${label}`);
  return normalized;
}

function validatePreferences(body) {
  fields(body, ["day_preferences", "time_preferences", "objectives"], "Preferences");
  return {
    day_preferences: collection(body.day_preferences, (row) => {
      fields(row, ["day_of_week", "preference_type", "constraint_level"], "Day preference");
      return {
        day_of_week: member(row.day_of_week, DAYS, "day_of_week"),
        preference_type: member(row.preference_type, TYPES, "preference_type"),
        constraint_level: member(row.constraint_level, LEVELS, "constraint_level"),
      };
    }, (row) => `${row.day_of_week}/${row.preference_type}`, "day preferences"),
    time_preferences: collection(body.time_preferences, (row) => {
      fields(row, ["start_time", "end_time", "preference_type", "constraint_level"], "Time preference");
      return {
        ...timeRange(row),
        preference_type: member(row.preference_type, TYPES, "preference_type"),
        constraint_level: member(row.constraint_level, LEVELS, "constraint_level"),
      };
    }, (row) => `${row.start_time}/${row.end_time}/${row.preference_type}`, "time preferences"),
    objectives: collection(body.objectives, (row) => {
      fields(row, ["objective_type", "priority"], "Objective");
      const objective_type = member(row.objective_type, OBJECTIVES, "objective_type");
      if (!Number.isInteger(row.priority) || row.priority < 1 || row.priority > 2147483647) {
        throw new PlanningError(400, "priority must be a positive integer within the database INT range");
      }
      return { objective_type, priority: row.priority };
    }, (row) => row.objective_type, "objectives"),
  };
}

function validateBlock(body) {
  fields(body, ["day_of_week", "start_time", "end_time"], "Blocked period");
  return { day_of_week: member(body.day_of_week, DAYS, "day_of_week"), ...timeRange(body) };
}

module.exports = { validatePreferences, validateBlock, normalizeTime, timeRange, DAYS };
