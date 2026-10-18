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

export const indexProblem = (
  code,
  indexNo,
  error,
  validation,
  localReason
) => {
  const result =
    validation ||
    error?.details?.validation ||
    error?.details?.data?.validation ||
    {};

  const reasons = [];

  reasons.push(...list(result.conflicts).map(describeConflict));

  reasons.push(
    ...list(result.missing_slot_indexes).map(
      (item) =>
        `${item.course_code || "Course"} index ${
          item.index_no ?? "unknown"
        } has no timetable sessions.`
    )
  );

  reasons.push(
    ...list(result.data_issues).map(
      (item) => item.message || item.reason
    )
  );

  reasons.push(
    ...list(result.warnings).map(
      (item) =>
        typeof item === "string" ? item : item?.message
    )
  );

  const eligibility = error?.details?.eligibility;

  if (eligibility?.message) {
    reasons.push(eligibility.message);
  }

  return {
    title: "Unable to select index",
    label: `${code} · Index ${indexNo}`,
    summary:
      localReason ||
      error?.message ||
      (list(result.conflicts).length
        ? "This index clashes with a class in your timetable."
        : "This index cannot be saved to your plan."),
    reasons: unique(reasons),
    hint: "Choose another index, adjust blocked hours, or review the existing timetable.",
  };
};