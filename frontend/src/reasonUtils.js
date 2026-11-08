// Friendly explanations based on backend eligibility and timetable data.

const list = (value) => Array.isArray(value) ? value : [];

const unique = (items) =>
  [...new Set(items.filter(Boolean).map(String))];

const pairs = (groups, kind) =>
  list(groups).map((group) => {
    const alternatives = list(group?.alternatives).join(" or ");
    return alternatives ? `${kind}: ${alternatives}.` : null;
  });

export const courseProblem = (
  code,
  error,
  eligibility,
  completed = false
) => {
  const details =
    eligibility ||
    error?.details?.eligibility ||
    error?.details ||
    {};

  const reasons = [];

  if (completed) {
    reasons.push(
      "This course has already been completed according to the student record."
    );
  }

  reasons.push(
    ...pairs(
      details.missing_prerequisite_groups,
      "Missing prerequisite (complete one)"
    )
  );

  reasons.push(
    ...pairs(
      details.missing_corequisite_groups,
      "Missing corequisite (select one alongside)"
    )
  );

  if (details.programme_eligible === false) {
    reasons.push(
      "Your programme does not meet this course's restrictions."
    );
  }

  if (details.requires_review) {
    reasons.push(
      "Your programme eligibility requires a manual review; it cannot be approved here."
    );
  }

  const past = list(details.conflicting_completed_courses);
  const chosen = list(details.conflicting_selected_courses);

  if (past.length) {
    reasons.push(
      `Mutually exclusive with completed course(s): ${past.join(", ")}.`
    );
  }

  if (chosen.length) {
    reasons.push(
      `Mutually exclusive with selected course(s): ${chosen.join(", ")}.`
    );
  }

  if (!reasons.length && details.prerequisite_eligible === false) {
    reasons.push("Prerequisite requirements were not satisfied.");
  }

  if (!reasons.length && details.corequisite_eligible === false) {
    reasons.push("Corequisite requirements were not satisfied.");
  }

  const summary = completed
    ? "This course cannot be added again."
    : details.message ||
      error?.message ||
      "This course cannot be added to the current planning request.";

  return {
    title: "Unable to add course",
    label: code,
    summary,
    reasons: unique(reasons),
    hint: "Check the course requirements or choose another eligible course.",
  };
};

const shortTime = (time) =>
  typeof time === "string" ? time.slice(0, 5) : "";

const describeConflict = (item) => {
  const a =
    item?.first || item?.session_a || item?.session1 || {};
  const b =
    item?.second || item?.session_b || item?.session2 || {};

  const codes = unique([a.course_code, b.course_code]);
  const day =
    item?.day_of_week || a.day_of_week || b.day_of_week;

  const overlapStart = shortTime(
    item?.overlap_start || item?.overlap_start_time
  );

  const overlapEnd = shortTime(
    item?.overlap_end || item?.overlap_end_time
  );

  if (codes.length || day || overlapStart) {
    const courses = codes.length
      ? codes.join(" and ")
      : "Two lessons";

    const when = [
      day,
      overlapStart && overlapEnd
        ? `${overlapStart}–${overlapEnd}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `${courses} overlap${when ? ` on ${when}` : ""}.`;
  }

  return item?.message || "Two lesson sessions overlap.";
};

const timetableReasons = (value) => [
  ...list(value?.conflicts).map(describeConflict),
  ...list(value?.missing_slot_indexes).map((item) =>
    [item.course_code || "Course", "index", item.index_no ?? "unknown", "has no timetable sessions."].join(" ")),
  ...list(value?.data_issues).map((item) => item.message || item.reason),
];

const constraintReason = (item) => {
  const slot = item.slot || {};
  const identity = [slot.course_code, slot.index_no, slot.day_of_week,
    [shortTime(slot.start_time), shortTime(slot.end_time)].filter(Boolean).join("–")]
    .filter(Boolean).join(" ");
  switch (item.code) {
    case "BLOCKED_PERIOD":
      return identity + " overlaps a saved blocked period (" +
        [shortTime(item.block?.start_time), shortTime(item.block?.end_time)].join("–") + ").";
    case "HARD_PREFER_DAY":
      return identity + " falls outside the allowed days: " + list(item.allowed_days).join(", ") + ".";
    case "HARD_AVOID_DAY":
      return identity + " is on a day you marked as a hard avoid rule.";
    case "HARD_PREFER_TIME":
      return identity + " does not fit inside one allowed time window.";
    case "HARD_AVOID_TIME":
      return identity + " overlaps a hard avoid time range.";
    default:
      return item.explanation || item.message || item.code || "A hard constraint failed.";
  }
};

export const indexProblem = (code, indexNo, error, validation, localReason) => {
  // Preview flattens timetable fields; failed writes nest them under timetable.
  const result = validation || error?.details?.validation ||
    error?.details?.data?.validation || {};
  const timetable = result.timetable || result;
  const academic = result.eligibility || error?.details?.eligibility || {};
  const reasons = timetableReasons(timetable);

  for (const courseCode of list(academic.unselected_courses)) {
    reasons.push(courseCode + " is stored in this plan but is not selected in its planning request. Remove its obsolete plan index.");
  }
  const courses = Array.isArray(academic.courses) ? academic.courses : [academic];
  for (const course of courses) {
    const name = course.course_code || code;
    if (course.already_completed === true) {
      reasons.push(name + " has already been completed and cannot remain in the planned course set.");
    } else if (course.can_select === false || course.requires_review === true) {
      reasons.push(name + ": " + (course.message || "Academic eligibility does not permit this selection."));
    }
    // Pending corequisites/missing indexes do not block an incremental save
    // when can_select is true. Final selection still enforces them on the server.
  }
  if (academic.message && !Array.isArray(academic.courses) &&
      academic.can_select !== true && !academic.already_completed) {
    reasons.push(academic.message);
  }
  for (const item of list(result.invalid_term_indexes)) {
    reasons.push([item.course_code, "index", item.index_no,
      "does not match this planning request's academic year and semester."].join(" "));
  }
  for (const item of list(result.constraints?.violations)) {
    if (item.code === "INCOMPLETE_TIMETABLE") reasons.push(...timetableReasons(item.data));
    else reasons.push(constraintReason(item));
  }

  const warnings = unique(list(timetable.warnings).map((item) => {
    if (typeof item === "string") return item;
    return [item.course_code, item.index_no].filter(value => value != null).join(" / ") +
      (item.message ? ": " + item.message : "");
  }));

  return {
    title: "Unable to select index",
    label: code + " · Index " + indexNo,
    summary: localReason || error?.message ||
      (list(timetable.conflicts).length
        ? "This index clashes with a class in your timetable."
        : "This index cannot be saved to your plan."),
    reasons: unique(reasons),
    warnings,
    hint: "Resolve the blocking reasons above, then try this index again.",
  };
};

// Group presentation only. The complete backend evidence remains available
// in the details view; neither constraints nor validation results are changed.
export const generationProblem = (failure = {}) => {
  const raw = list(failure.reasons);
  const general = new Set(["NO_VALID_INDEX"]);
  const blocked = new Map();

  for (const reason of raw.filter(item => item.code === "BLOCKED_PERIOD_CONFLICT")) {
    const key = JSON.stringify([
      reason.course_code || "",
      reason.block_id ?? "",
      reason.day || reason.day_of_week || "",
      reason.blocked_start || "",
      reason.blocked_end || "",
    ]);

    if (!blocked.has(key)) {
      blocked.set(key, {
        course_code: reason.course_code,
        code: reason.code,
        day: reason.day || reason.day_of_week,
        blocked_start: shortTime(reason.blocked_start),
        blocked_end: shortTime(reason.blocked_end),
        indexes: [],
        class_times: [],
      });
    }

    const group = blocked.get(key);
    if (reason.index_no != null && !group.indexes.includes(reason.index_no)) {
      group.indexes.push(reason.index_no);
    }
    const classTime = [shortTime(reason.class_start), shortTime(reason.class_end)]
      .filter(Boolean)
      .join("–");
    if (classTime && !group.class_times.includes(classTime)) {
      group.class_times.push(classTime);
    }
  }

  const groups = new Map();
  for (const reason of raw) {
    if (reason.code === "BLOCKED_PERIOD_CONFLICT") continue;
    if (general.has(reason.code) && raw.some(other =>
      other !== reason && other.course_code === reason.course_code && !general.has(other.code))) continue;
    const explanation = reason.explanation || reason.message || reason.code || "Review the planning request.";
    const key = JSON.stringify([reason.course_code || "", reason.code, explanation]);
    if (!groups.has(key)) groups.set(key, {
      course_code: reason.course_code, code: reason.code, explanation, indexes: [],
    });
    const indexes = groups.get(key).indexes;
    if (reason.index_no != null && !indexes.includes(reason.index_no)) indexes.push(reason.index_no);
  }

  const blockedReasons = [...blocked.values()].map(group => ({
    course_code: group.course_code,
    code: group.code,
    indexes: group.indexes,
    explanation: [
      `Your ${group.day || "saved"} ${group.blocked_start || ""}–${group.blocked_end || ""} block overlaps`,
      group.class_times.length
        ? `class time${group.class_times.length === 1 ? "" : "s"} ${group.class_times.join(", ")}.`
        : "one or more class sessions.",
      "Adjust or remove this block, or remove the course, then regenerate.",
    ].join(" ").replace(/\s+/g, " ").trim(),
  }));

  return {
    summary: failure.code === "SEARCH_LIMIT_REACHED"
      ? "The timetable search reached its limit. Feasibility is still unconfirmed."
      : failure.infeasibility_proven === true
        ? "No timetable satisfies the current courses and hard constraints."
        : "A validated timetable could not be generated.",
    reasons: [...blockedReasons, ...groups.values()],
    suggestions: unique(list(failure.suggestions).map(item => item.explanation || item.action)),
    timetable_preserved: failure.code === "NO_FEASIBLE_PLAN",
  };
};
