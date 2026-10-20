// Pure translation of validation/search evidence. Never infer feasibility from
// a sample rejection or claim that changing an index fixes course-level rules.
const unique = rows => [...new Map(rows.map(row => [JSON.stringify(row), row])).values()];
const slotFields = slot => ({ course_code: slot.course_code, index_no: slot.index_no,
  slot_id: slot.slot_id, day: slot.day_of_week, class_start: slot.start_time, class_end: slot.end_time });

function academicReasons(eligibility) {
  const reasons = [];
  for (const course of eligibility?.courses || []) {
    const base = { course_code: course.course_code, index_change_can_resolve: false };
    if (!course.prerequisite_eligible || course.programme_eligible !== true) reasons.push({ ...base, code: "COURSE_INELIGIBLE",
      prerequisite_eligible: course.prerequisite_eligible, programme_eligible: course.programme_eligible,
      requires_review: course.requires_review, missing_prerequisite_groups: course.missing_prerequisite_groups,
      explanation: "Prerequisite or programme eligibility is not satisfied or cannot be confirmed; changing the index does not resolve it." });
    if (!course.corequisite_eligible) reasons.push({ ...base, code: "COREQUISITE_UNSATISFIED",
      missing_corequisite_groups: course.missing_corequisite_groups,
      explanation: "Complete or select at least one alternative in each missing corequisite group, and include the selected corequisite in the plan." });
    for (const [context, codes] of [["selected", course.conflicting_selected_courses], ["completed", course.conflicting_completed_courses]]) {
      for (const code of codes || []) reasons.push({ ...base, code: "MUTUAL_EXCLUSION", conflicting_course_code: code,
        conflicting_course_context: context,
        explanation: `This course is mutually exclusive with ${context} course ${code}; choosing another index cannot resolve it.` });
    }
  }
  for (const course_code of eligibility?.missing_index_courses || []) reasons.push({ code: "MISSING_SELECTED_INDEX", course_code,
    explanation: "A selected course has no chosen index in the surrounding plan." });
  for (const course_code of eligibility?.unselected_courses || []) reasons.push({ code: "COURSE_NOT_SELECTED", course_code,
    explanation: "The plan contains a course not selected in the parent planning request." });
  return reasons;
}

function clashReasons(conflicts = []) {
  return conflicts.flatMap(conflict => {
    const reason = { code: "TIMETABLE_CLASH", ...slotFields(conflict.first),
      conflicting_course_code: conflict.second.course_code, conflicting_index_no: conflict.second.index_no,
      conflicting_slot_id: conflict.second.slot_id, conflicting_class_start: conflict.second.start_time,
      conflicting_class_end: conflict.second.end_time, overlap_start: conflict.overlap_start, overlap_end: conflict.overlap_end,
      certainty: conflict.certainty, overlapping_weeks: conflict.overlapping_weeks,
      explanation: conflict.reason };
    const locked = [];
    if (conflict.first_locked) locked.push({ course_code: conflict.first.course_code, index_no: conflict.first.index_no });
    if (conflict.second_locked) locked.push({ course_code: conflict.second.course_code, index_no: conflict.second.index_no });
    return [reason, ...(locked.length ? [{ ...reason, code: "LOCKED_INDEX_CONFLICT", locked_indexes: locked,
      requires_student_action: true, explanation: "An observed timetable clash involves a locked index. It cannot be replaced automatically." }] : [])];
  });
}

function timetableReasons(timetable) {
  return [
    ...(timetable?.missing_slot_indexes || []).map(index => ({ code: "INCOMPLETE_TIMETABLE_DATA", ...index,
      explanation: "This index has no class slots; it cannot be validated or recommended." })),
    ...(timetable?.data_issues || []).map(issue => ({ code: "INCOMPLETE_TIMETABLE_DATA", ...issue, explanation: issue.message })),
    ...clashReasons(timetable?.conflicts),
  ];
}

function constraintReasons(constraints) {
  return (constraints?.violations || []).flatMap(violation => {
    if (violation.code === "INCOMPLETE_TIMETABLE") return timetableReasons(violation.data);
    const base = slotFields(violation.slot);
    if (violation.code === "BLOCKED_PERIOD") return [{ code: "BLOCKED_PERIOD_CONFLICT", ...base,
      block_id: violation.block.block_id, blocked_start: violation.block.start_time, blocked_end: violation.block.end_time,
      overlap_start: violation.overlap_start, overlap_end: violation.overlap_end,
      explanation: "The class overlaps a saved blocked period on this day." }];
    const day = violation.code.endsWith("DAY");
    return [{ code: day ? "HARD_DAY_CONSTRAINT" : "HARD_TIME_CONSTRAINT", ...base,
      constraint: violation.code, rule: violation.rule, allowed_days: violation.allowed_days,
      allowed_windows: violation.allowed_windows,
      explanation: violation.code.includes("PREFER")
        ? (day ? "The class is outside the allowed HARD PREFER days." : "The entire class does not fit inside one HARD PREFER time window.")
        : (day ? "The class occurs on a HARD AVOID day." : "The class overlaps a HARD AVOID time range.") }];
  });
}

function validationReasons(validation, focusCourse = null) {
  const timetable = { ...validation.timetable, conflicts: (validation.timetable?.conflicts || []).map(conflict =>
    focusCourse && conflict.second.course_code === focusCourse && conflict.first.course_code !== focusCourse
      ? { ...conflict, first: conflict.second, second: conflict.first } : conflict) };
  return unique([...academicReasons(validation.eligibility), ...timetableReasons(timetable),
    ...constraintReasons(validation.constraints),
    ...(validation.invalid_term_indexes || []).map(index => ({ code: "INDEX_TERM_MISMATCH", ...index,
      explanation: "This course/index is unavailable in the request academic year and semester." })),
  ]);
}

function explainReasons(input) {
  const reasons = unique(input).map((reason, i) => ({ ...reason, reason_id: `reason_${i + 1}` }));
  const suggestions = [];
  function suggest(reason, action, explanation, extra = {}) {
    suggestions.push({ action, course_code: reason.course_code, index_no: reason.index_no,
      reason_ids: [reason.reason_id], requires_student_action: true, auto_applied: false,
      requires_revalidation: true, guarantees_feasibility: false, explanation, ...extra });
  }
  for (const reason of reasons) {
    switch (reason.code) {
      case "BLOCKED_PERIOD_CONFLICT":
        suggest(reason, "REVIEW_BLOCKED_PERIOD", "Change/remove this block only if the student is available then, or review other indexes.",
          { block_id: reason.block_id, day: reason.day, blocked_start: reason.blocked_start, blocked_end: reason.blocked_end }); break;
      case "HARD_DAY_CONSTRAINT":
      case "HARD_TIME_CONSTRAINT":
        suggest(reason, "REVIEW_HARD_CONSTRAINT", "Review this hard rule with the student; relaxing it requires an explicit preference change.",
          { constraint: reason.constraint }); break;
      case "COREQUISITE_UNSATISFIED":
        for (const group of reason.missing_corequisite_groups || []) suggest(reason, "SELECT_COREQUISITE",
          "Select at least one eligible alternative from this missing group and include its index in the plan.",
          { requirement_group: group.requirement_group, course_options: group.alternatives }); break;
      case "MUTUAL_EXCLUSION":
        suggest(reason, "REVIEW_SELECTED_COURSES", reason.conflicting_course_context === "completed"
          ? "Choose a different course; completed coursework cannot be resolved by changing indexes."
          : "Remove or change one of these mutually exclusive selected courses; remove its plan indexes first.",
        { conflicting_course_code: reason.conflicting_course_code, conflicting_course_context: reason.conflicting_course_context }); break;
      case "LOCKED_INDEX_INVALID":
        suggest(reason, "REVIEW_LOCKED_INDEX", "Explicitly unlock or change this locked index, then revalidate; it has not been replaced."); break;
      case "LOCKED_INDEX_CONFLICT":
        for (const index of reason.locked_indexes) suggest(reason, "REVIEW_LOCKED_INDEX",
          "Review unlocking or changing this index with the student; the observed clash does not prove that unlocking alone is sufficient.", index); break;
      case "TIMETABLE_CLASH":
        suggest(reason, "REVIEW_INDEX_SELECTION", "Review alternatives for the conflicting indexes. No replacement is guaranteed until full-plan validation passes.",
          { conflicting_course_code: reason.conflicting_course_code, conflicting_index_no: reason.conflicting_index_no }); break;
      case "INCOMPLETE_TIMETABLE_DATA":
        suggest(reason, "REVIEW_TIMETABLE_DATA", "Obtain complete timetable data or use an index that passes full-plan validation."); break;
      case "NO_INDEXES_FOR_TERM":
      case "INDEX_TERM_MISMATCH":
        suggest(reason, "REVIEW_TERM_SELECTION", "Review the request term and course/index availability."); break;
      case "COURSE_INELIGIBLE":
        suggest(reason, "REVIEW_COURSE_ELIGIBILITY", "Resolve the academic requirement or choose an eligible course; another index does not remove this restriction."); break;
    }
  }
  return { reasons, suggestions };
}

function explainGeneration(details, search) {
  const expanded = [];
  const limited = !search.exhaustive;
  // Preserve existing summary reason codes for clients. A bounded search must
  // not describe unproven infeasibility or blame locks without direct evidence.
  for (const detail of details) {
    if (!limited) expanded.push({ ...detail, explanation: detail.message || ({
      NO_SELECTED_COURSES: "Select courses before generating a timetable.",
      NO_CLASH_FREE_COMBINATION: "No complete clash-free combination exists in the validated index domains.",
      LOCKED_COMBINATION_INFEASIBLE: "No complete combination exists with these locks; locks are not necessarily the sole cause.",
      ACADEMIC_INELIGIBILITY: "The selected course set fails final academic validation.",
      FINAL_VALIDATION_FAILED: "Final validation rejected a generated candidate before persistence.",
      LOCKED_COURSE_NOT_SELECTED: "A locked index belongs to a course no longer selected in the request.",
    }[detail.code] || "No usable index remains under the current constraints.") });
    if (detail.eligibility) expanded.push(...academicReasons(detail.eligibility));
    if (detail.validation) expanded.push(...validationReasons(detail.validation));
    if (detail.term_index_count === 0) expanded.push({ code: "NO_INDEXES_FOR_TERM", course_code: detail.course_code,
      explanation: "This course has no indexes in the request academic year and semester." });
    if (detail.code === "LOCKED_INDEX_INVALID" && detail.term_index_count > 0 && !detail.rejected_indexes.length) {
      expanded.push({ code: "INDEX_TERM_MISMATCH", course_code: detail.course_code, index_no: detail.index_no,
        explanation: "The locked index does not match the request term, even though other indexes are offered." });
    }
    for (const rejected of detail.rejected_indexes || []) expanded.push(...timetableReasons(rejected.timetable), ...constraintReasons(rejected.constraints));
  }
  if (limited) expanded.unshift({ code: "SEARCH_LIMIT_REACHED", limit_reason: search.limit_reason,
    explanation: "Search stopped at its budget. Infeasibility and a single root cause have not been proven." });
  expanded.push(...clashReasons(search.observed_conflicts).map(reason => ({ ...reason, evidence_scope: "observed_rejection",
    explanation: `${reason.explanation} This is one observed rejection, not necessarily the sole cause of generation failure.` })));
  const uncertain = expanded.some(reason => reason.code === "INCOMPLETE_TIMETABLE_DATA" || reason.requires_review || reason.code === "FINAL_VALIDATION_FAILED");
  return { ...explainReasons(expanded), infeasibility_proven: !limited && !uncertain,
    feasibility_scope: "current_request_and_validated_index_domains",
    conflict_evidence_truncated: Boolean(search.conflict_evidence_truncated) };
}

module.exports = { validationReasons, explainReasons, explainGeneration };
