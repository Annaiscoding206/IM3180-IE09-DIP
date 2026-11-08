const minute = value => {
  const [h, m, s = 0] = value.split(":").map(Number);
  return h * 60 + m + s / 60;
};

function combinationKey(indexes) {
  return JSON.stringify([...indexes].sort((a, b) => a.course_code.localeCompare(b.course_code))
    .map(index => [index.course_code, index.index_no]));
}

function scorePlan(indexes, preferences) {
  const slots = indexes.flatMap(index => index.slots);
  const days = [...new Set(slots.map(slot => slot.day_of_week))];
  let gaps = 0;
  // Weekly footprint: project all sessions onto weekdays, regardless of their
  // teaching-week subsets. Merge overlaps/nesting before measuring positive
  // intra-day gaps; never count nights, pre-class or post-class time.
  for (const day of days) {
    const intervals = slots.filter(slot => slot.day_of_week === day)
      .map(slot => [minute(slot.start_time), minute(slot.end_time)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let end = intervals[0][1];
    for (const [start, nextEnd] of intervals.slice(1)) {
      gaps += Math.max(0, start - end);
      end = Math.max(end, nextEnd);
    }
  }
  const softDays = preferences.day_preferences.filter(p => p.constraint_level === "SOFT");
  const softTimes = preferences.time_preferences.filter(p => p.constraint_level === "SOFT");
  let dayPenalty = 0, dayReward = 0, timePenalty = 0, timeReward = 0;
  for (const p of softDays) {
    const present = days.includes(p.day_of_week);
    if (p.preference_type === "PREFER") { dayReward += Number(present); dayPenalty += Number(!present); }
    else dayPenalty += Number(present);
  }
  const duration = slots.reduce((sum, s) => sum + minute(s.end_time) - minute(s.start_time), 0);
  for (const p of softTimes) {
    const overlap = slots.reduce((sum, s) => sum + Math.max(0,
      Math.min(minute(s.end_time), minute(p.end_time)) - Math.max(minute(s.start_time), minute(p.start_time))), 0);
    const fraction = duration ? overlap / duration : 0;
    if (p.preference_type === "PREFER") { timeReward += fraction; timePenalty += 1 - fraction; }
    else timePenalty += fraction;
  }
  // Exact cost (lower is better):
  // dayPenalty/max(1,#softDayRules) + timePenalty/max(1,#softTimeRules)
  // + SUM(metric/priority), metric = campus_days/7 OR total_gap_minutes/600.
  // Priority 1 has the highest weight. Preferred-rule penalties are missed
  // rewards; avoided-rule penalties are attendance/overlap. No double reward.
  // Score = round(100/(1+cost),2). Rank by UNROUNDED cost, then canonical index
  // combination key so score rounding cannot change ordering or create ties.
  let cost = dayPenalty / Math.max(1, softDays.length) + timePenalty / Math.max(1, softTimes.length);
  for (const p of preferences.objectives) {
    cost += (p.objective_type === "MINIMIZE_SCHOOL_DAYS" ? days.length / 7 : gaps / 600) / p.priority;
  }
  return { campus_days: days.length, total_gap_minutes: gaps,
    soft_day_penalty: dayPenalty, soft_day_reward: dayReward,
    soft_time_penalty: timePenalty, soft_time_reward: timeReward,
    cost, match_score: Number((100 / (1 + cost)).toFixed(2)) };
}

function rankPlans(candidates, preferences) {
  return candidates.map(indexes => ({ indexes, metrics: scorePlan(indexes, preferences), key: combinationKey(indexes) }))
    .sort((a, b) => a.metrics.cost - b.metrics.cost || a.key.localeCompare(b.key));
}
module.exports = { scorePlan, rankPlans, combinationKey };
