// Pure timetable validation: no database writes or HTTP dependencies.
// NULL/blank weeks are a wildcard, not evidence that a class runs every week.
function parseWeeks(value) {
  if (value == null || String(value).trim() === "") return { weeks: null };
  const weeks = new Set();
  for (const part of String(value).split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return { error: "Unsupported teaching_weeks format" };
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    // Bound expansion of malformed data; this is not a semester-length rule.
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
        first < 1 || last < first || last - first > 1000) {
      return { error: "Invalid teaching_weeks range" };
    }
    for (let week = first; week <= last; week++) weeks.add(week);
  }
  return { weeks };
}

function seconds(value) {
  const match = String(value).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, hours, minutes, secs] = match.map(Number);
  return hours < 24 && minutes < 60 && secs < 60
    ? hours * 3600 + minutes * 60 + secs : null;
}

const slotDetails = (slot) => ({
  slot_id: slot.slot_id,
  course_code: slot.course_code,
  index_no: slot.index_no,
  class_type: slot.class_type,
  class_group: slot.class_group,
  day_of_week: slot.day_of_week,
  start_time: slot.start_time,
  end_time: slot.end_time,
  teaching_weeks: slot.teaching_weeks,
});

function checkClashes(indexes) {
  const missing = [];
  const issues = [];
  const warnings = [];
  const slots = [];
  for (const index of indexes) {
    if (index.slots.length === 0) {
      missing.push({ course_code: index.course_code, index_no: index.index_no });
    }
    for (const row of index.slots) {
      const slot = { ...row, course_code: index.course_code, index_no: index.index_no };
      const parsed = parseWeeks(slot.teaching_weeks);
      const start = seconds(slot.start_time);
      const end = seconds(slot.end_time);
      const identity = { course_code: index.course_code, index_no: index.index_no, slot_id: slot.slot_id };
      if (parsed.error || start === null || end === null || end <= start ||
          !["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(slot.day_of_week)) {
        issues.push({ ...identity, message: parsed.error || "Invalid class day/time" });
        continue;
      }
      if (parsed.weeks === null) {
        warnings.push({ ...identity, message: "Teaching weeks unspecified; assuming possible overlap" });
      }
      slots.push({ slot, start, end, weeks: parsed.weeks });
    }
  }

  const conflicts = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.slot.day_of_week !== b.slot.day_of_week ||
          a.start >= b.end || b.start >= a.end) continue;
      const knownWeeks = a.weeks !== null && b.weeks !== null;
      const overlapWeeks = knownWeeks
        ? [...a.weeks].filter((week) => b.weeks.has(week)).sort((x, y) => x - y) : null;
      if (knownWeeks && overlapWeeks.length === 0) continue;
      conflicts.push({
        first: slotDetails(a.slot),
        second: slotDetails(b.slot),
        day_of_week: a.slot.day_of_week,
        overlap_start: a.start >= b.start ? a.slot.start_time : b.slot.start_time,
        overlap_end: a.end <= b.end ? a.slot.end_time : b.slot.end_time,
        overlapping_weeks: overlapWeeks,
        certainty: knownWeeks ? "confirmed" : "potential",
        reason: knownWeeks ? "Class times and teaching weeks overlap" : "Class times overlap; teaching weeks are unspecified",
      });
    }
  }
  const incomplete = missing.length > 0 || issues.length > 0;
  return {
    status: incomplete ? "incomplete" : conflicts.length > 0 ? "conflict" : "clear",
    can_save: !incomplete && conflicts.length === 0,
    conflicts,
    missing_slot_indexes: missing,
    data_issues: issues,
    warnings,
  };
}

module.exports = { checkClashes };
