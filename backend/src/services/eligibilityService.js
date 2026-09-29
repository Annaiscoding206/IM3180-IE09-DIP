const pool = require("../config/db");

class EligibilityNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "EligibilityNotFoundError";
  }
}

const normalizeCode = (value) => value.trim().toUpperCase();

// Optional query executor keeps plan validation on its transaction connection.
const evaluateEligibility = async (studentId, courseCode, db = pool) => {
  const [students] = await db.query(
    `SELECT student_id, programme FROM student WHERE student_id = ? LIMIT 1`,
    [studentId]
  );
  if (students.length === 0) {
    throw new EligibilityNotFoundError("Student not found");
  }

  const [courses] = await db.query(
    `SELECT course_code FROM course_info WHERE course_code = ? LIMIT 1`,
    [courseCode]
  );
  if (courses.length === 0) {
    throw new EligibilityNotFoundError("Course not found");
  }

  const student = students[0];
  const course = courses[0];
  const [requirements] = await db.query(
    `SELECT required_course_code, requirement_group
     FROM course_requirement
     WHERE course_code = ? AND requirement_type = 'PREREQUISITE'
     ORDER BY requirement_group, required_course_code`,
    [course.course_code]
  );
  const [completedCourses] = await db.query(
    `SELECT course_code FROM completed_course WHERE student_id = ?`,
    [student.student_id]
  );
  const [restrictions] = await db.query(
    `SELECT programme, cohort, restriction_type
     FROM programme_restriction WHERE course_code = ?
     ORDER BY restriction_id`,
    [course.course_code]
  );

  const completed = new Set(
    completedCourses.map((row) => normalizeCode(row.course_code))
  );
  const groups = new Map();
  for (const requirement of requirements) {
    const group = requirement.requirement_group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(requirement.required_course_code);
  }

  // Any option satisfies one group; every group must be satisfied.
  const missingGroups = [...groups].filter(([, alternatives]) =>
    !alternatives.some((code) => completed.has(normalizeCode(code)))
  ).map(([requirement_group, alternatives]) => ({
    requirement_group,
    alternatives,
  }));
  const prerequisiteEligible = missingGroups.length === 0;

  const matchesProgramme = (rule) =>
    normalizeCode(rule.programme) === normalizeCode(student.programme);
  const hasCohort = (rule) => Boolean(rule.cohort && rule.cohort.trim());
  const generalRules = restrictions.filter((rule) => !hasCohort(rule));
  const blocked = generalRules.some((rule) =>
    rule.restriction_type === "NOT_AVAILABLE" && matchesProgramme(rule)
  );
  const allowedProgrammes = generalRules.filter((rule) =>
    rule.restriction_type === "ONLY_AVAILABLE"
  );

  // Student has no cohort/admission fields. Do not infer a cohort from study_year.
  // A cohort-only allowlist may affect any programme; a cohort-only denial
  // matters only for its named programme. Report uncertainty and block adding
  // until it can be resolved, without claiming the student violates that rule.
  const unresolvedRestrictions = restrictions.filter((rule) =>
    hasCohort(rule) &&
    (rule.restriction_type === "ONLY_AVAILABLE" || matchesProgramme(rule))
  );

  let programmeEligible = true;
  const reasons = [];
  if (!prerequisiteEligible) {
    reasons.push("Missing prerequisite groups: complete at least one alternative in each missing group");
  }
  if (blocked) {
    // A definite general denial remains decisive, even if other rules are unknown.
    programmeEligible = false;
    reasons.push("Course is not available to your programme");
  } else if (unresolvedRestrictions.length > 0) {
    programmeEligible = null;
    reasons.push("Programme eligibility cannot be confirmed: cohort data is unavailable; manual review is required");
  } else if (allowedProgrammes.length > 0 &&
             !allowedProgrammes.some(matchesProgramme)) {
    programmeEligible = false;
    reasons.push("Course is only available to other programmes");
  }

  return {
    student_id: student.student_id,
    course_code: course.course_code,
    prerequisite_eligible: prerequisiteEligible,
    programme_eligible: programmeEligible,
    eligible: prerequisiteEligible && programmeEligible === true,
    requires_review: programmeEligible === null,
    missing_prerequisite_groups: missingGroups,
    // Kept for existing clients; these are alternatives in UNSATISFIED groups,
    // not a list of courses the student must all complete.
    missing_prerequisites: [...new Set(missingGroups.flatMap((group) => group.alternatives))],
    programme_restrictions: restrictions,
    unresolved_restrictions: unresolvedRestrictions,
    message: reasons.length > 0
      ? reasons.join("; ")
      : requirements.length === 0
        ? "No prerequisite required; programme requirements satisfied"
        : "All prerequisites and programme requirements satisfied",
  };
};

module.exports = { evaluateEligibility, EligibilityNotFoundError };
