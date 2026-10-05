const normalizeCode = (code) => code.trim().toUpperCase();

function checkMutualExclusions(
  courseCode,
  exclusions,
  completedCourseCodes,
  selectedCourseCodes = []
) {
  const target = normalizeCode(courseCode);
  const excludedCodes = new Set();

  for (const rule of exclusions) {
    const left = normalizeCode(rule.course_code);
    const right = normalizeCode(rule.excluded_course_code);

    // Mutual exclusion applies in both directions.
    if (left === target) excludedCodes.add(right);
    if (right === target) excludedCodes.add(left);
  }

  const findConflicts = (codes) =>
    [...new Set(codes.map(normalizeCode))]
      .filter((code) => excludedCodes.has(code))
      .sort();

  const completedConflicts = findConflicts(completedCourseCodes);
  const selectedConflicts = findConflicts(selectedCourseCodes);

  return {
    mutual_exclusion_eligible:
      completedConflicts.length === 0 &&
      selectedConflicts.length === 0,
    conflicting_completed_courses: completedConflicts,
    conflicting_selected_courses: selectedConflicts,
  };
}

module.exports = { checkMutualExclusions };