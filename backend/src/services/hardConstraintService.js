const { checkClashes } = require("./clashService");
const { findBlockedPeriodConflicts } = require("./blockedPeriodService");
const { normalizeTime } = require("./preferenceValidation");
const { readPreferences, readBlocks } = require("./preferenceService");

// Read on the caller's transaction connection, under its parent request lock.
// The preference service exposes these readers without opening another transaction.
async function readPreferenceSnapshot(db, requestId) {
  return { ...await readPreferences(db, requestId), ...await readBlocks(db, requestId) };
}

function checkHardConstraints(indexes, preferences) {
  const data = checkClashes(indexes);
  if (data.status === "incomplete") return { valid: false, violations: [{ code: "INCOMPLETE_TIMETABLE", data }] };
  const slots = indexes.flatMap(index => index.slots.map(slot => ({ ...slot, course_code: index.course_code, index_no: index.index_no })));
  const days = preferences.day_preferences.filter(p => p.constraint_level === "HARD");
  const times = preferences.time_preferences.filter(p => p.constraint_level === "HARD")
    .map(p => ({ ...p, start_time: normalizeTime(p.start_time), end_time: normalizeTime(p.end_time) }));
  const allowedDays = days.filter(p => p.preference_type === "PREFER").map(p => p.day_of_week);
  const allowedTimes = times.filter(p => p.preference_type === "PREFER");
  const violations = [];
  // HARD PREFER days form a whitelist; no attendance on each day is required.
  // Windows are alternatives: an entire session must fit ONE window. Adjacent
  // windows are not merged. AVOID and blocked rules apply in addition, never
  // weakened to satisfy PREFER. All rules apply across all teaching weeks.
  for (const slot of slots) {
    if (allowedDays.length && !allowedDays.includes(slot.day_of_week)) violations.push({ code: "HARD_PREFER_DAY", slot });
    if (days.some(p => p.preference_type === "AVOID" && p.day_of_week === slot.day_of_week)) violations.push({ code: "HARD_AVOID_DAY", slot });
    if (allowedTimes.length && !allowedTimes.some(p => slot.start_time >= p.start_time && slot.end_time <= p.end_time)) {
      violations.push({ code: "HARD_PREFER_TIME", slot });
    }
    for (const rule of times.filter(p => p.preference_type === "AVOID")) {
      if (slot.start_time < rule.end_time && rule.start_time < slot.end_time) violations.push({ code: "HARD_AVOID_TIME", slot, rule });
    }
  }
  for (const conflict of findBlockedPeriodConflicts(slots, preferences.blocked_periods)) {
    violations.push({ code: "BLOCKED_PERIOD", ...conflict });
  }
  return { valid: violations.length === 0, violations };
}

module.exports = { readPreferenceSnapshot, checkHardConstraints };
