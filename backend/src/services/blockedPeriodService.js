const { timeRange, DAYS } = require("./preferenceValidation");

// Pure helper for later manual-index, generation and final-validation callers.
// Blocks apply every teaching week. Invalid schedules throw instead of looking clear.
function findBlockedPeriodConflicts(classSlots, blockedPeriods) {
  function normalize(row) {
    if (!DAYS.includes(row.day_of_week)) throw new TypeError("Invalid schedule weekday");
    return { ...row, ...timeRange(row) };
  }
  const slots = classSlots.map(normalize);
  const blocks = blockedPeriods.map(normalize);
  const conflicts = [];
  for (const slot of slots) {
    for (const block of blocks) {
      if (slot.day_of_week === block.day_of_week &&
          slot.start_time < block.end_time && block.start_time < slot.end_time) {
        conflicts.push({
          slot,
          block,
          day_of_week: slot.day_of_week,
          overlap_start: slot.start_time > block.start_time ? slot.start_time : block.start_time,
          overlap_end: slot.end_time < block.end_time ? slot.end_time : block.end_time,
        });
      }
    }
  }
  return conflicts;
}

module.exports = { findBlockedPeriodConflicts };
