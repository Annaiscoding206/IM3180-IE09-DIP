const normalizeCode = (code) => code.trim().toUpperCase();

function checkCorequisites(
  requirements,
  completedCourseCodes,
  selectedCourseCodes = []
) {
  // A corequisite can be completed already or selected for this semester.
  const availableCourses = new Set(
    [...completedCourseCodes, ...selectedCourseCodes].map(normalizeCode)
  );

  const groups = new Map();

  for (const requirement of requirements) {
    if (requirement.requirement_type !== "COREQUISITE") continue;

    const group = requirement.requirement_group;
    const code = normalizeCode(requirement.required_course_code);

    if (!groups.has(group)) {
      groups.set(group, new Set());
    }

    groups.get(group).add(code);
  }

  const missingGroups = [];

  for (const [group, alternatives] of groups) {
    const satisfied = [...alternatives].some(
      (code) => availableCourses.has(code)
    );

    if (!satisfied) {
      missingGroups.push({
        requirement_group: group,
        alternatives: [...alternatives],
      });
    }
  }

  return {
    corequisite_eligible: missingGroups.length === 0,
    missing_corequisite_groups: missingGroups,
  };
}

module.exports = { checkCorequisites };