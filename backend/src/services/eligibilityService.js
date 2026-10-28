const { evaluateCurriculumYear } = require("./curriculumRulesService");
const pool = require("../config/db");
const { checkCorequisites } = require("./corequisiteService");
const { checkMutualExclusions } = require("./mutualExclusionService");
const { getCompletionSummary } = require("./degreeAuditService");


class EligibilityNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "EligibilityNotFoundError";
  }
}

const normalizeCode = (value) => value.trim().toUpperCase();

// A deliberately narrow parser: recognise only an explicit admission-year range
// followed by Direct Entry. Unknown cohort text remains review-required.
function appliesToDirectEntryCohort(cohort, student) {
  const label = String(cohort || "").trim().replace(/[\u2013\u2014]/g, "-");
  const match = /^(\d{4})\s*-\s*(\d{4})\s+Direct\s+Entry$/i.exec(label);
  if (!match) return null;

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  const admissionYear = Number(student.admission_year);
  if (startYear > endYear || !Number.isInteger(admissionYear) || admissionYear < 1900) return null;
  if (admissionYear < startYear || admissionYear > endYear) return false;

  const route = String(student.admission_route || "")
    .trim().replace(/[\s-]+/g, "_").toUpperCase();
  if (route === "DIRECT_ENTRY") return true;
  if (["NORMAL_ENTRY", "NORMAL", "STANDARD_ENTRY", "STANDARD"].includes(route)) return false;
  return null;
}

// Optional query executor keeps plan validation on its transaction connection.
const evaluateEligibility = async (
  studentId,
  courseCode,
  db = pool,
  requestId = null,
  planCourseCodes = null
) => {
  const [students] = await db.query(
    `SELECT student_id, programme, study_year, admission_year, admission_route FROM student WHERE student_id = ? LIMIT 1`,
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
  const [exclusions] = await db.query(
  `SELECT course_code, excluded_course_code
   FROM mutual_exclusion
   WHERE course_code = ? OR excluded_course_code = ?
   ORDER BY course_code, excluded_course_code`,
  [course.course_code, course.course_code]
);
  const [requirements] = await db.query(
    `SELECT required_course_code, requirement_group
     FROM course_requirement
     WHERE course_code = ? AND requirement_type = 'PREREQUISITE'
     ORDER BY requirement_group, required_course_code`,
    [course.course_code]
  );
  const [corequisiteRequirements] = await db.query(
  `SELECT required_course_code, requirement_group, requirement_type
   FROM course_requirement
   WHERE course_code = ? AND requirement_type = 'COREQUISITE'
   ORDER BY requirement_group, required_course_code`,
  [course.course_code]
  );
  const completion = await getCompletionSummary(student.student_id, db);
  const [restrictions] = await db.query(
    `SELECT programme, cohort, restriction_type
     FROM programme_restriction WHERE course_code = ?
     ORDER BY restriction_id`,
    [course.course_code]
  );

  const completed = new Set(
    completion.passed_course_codes.map(normalizeCode)
  );
  const studyYear = await evaluateCurriculumYear(student, course.course_code, db);
  const alreadyCompleted = completed.has(normalizeCode(course.course_code));
  let selectedCourseCodes = [];

  if (planCourseCodes !== null) {
    selectedCourseCodes = planCourseCodes
      .map(normalizeCode)
      .filter((code) => code !== normalizeCode(course.course_code));
  } else if (requestId !== null) {
  // Only use a planning request belonging to this student.
  const [requests] = await db.query(
    `SELECT request_id
     FROM planning_request
     WHERE request_id = ? AND student_id = ?
     LIMIT 1`,
    [requestId, student.student_id]
  );

  if (requests.length === 0) {
    throw new EligibilityNotFoundError(
      "Planning request not found for this student"
    );
  }

  const [selectedCourses] = await db.query(
    `SELECT course_code
     FROM planning_request_course
     WHERE request_id = ?
     ORDER BY course_code`,
    [requests[0].request_id]
  );

  selectedCourseCodes = selectedCourses
    .map((row) => normalizeCode(row.course_code))
    .filter((code) => code !== normalizeCode(course.course_code));
}

const corequisiteResult = checkCorequisites(
  corequisiteRequirements,
  [...completed],
  selectedCourseCodes
);
const mutualExclusionResult = checkMutualExclusions(
  course.course_code,
  exclusions,
  [...completed],
  selectedCourseCodes
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
  const blockedByGeneralRule = generalRules.some((rule) =>
    rule.restriction_type === "NOT_AVAILABLE" && matchesProgramme(rule)
  );
  const allowedProgrammes = generalRules.filter((rule) =>
    rule.restriction_type === "ONLY_AVAILABLE"
  );

  // A recognised NOT_AVAILABLE restriction blocks only the named programme and
  // matching admission cohort. Unsupported formats remain unknown, never guessed.
  const blockedByCohort = restrictions.some((rule) =>
    hasCohort(rule) &&
    rule.restriction_type === "NOT_AVAILABLE" &&
    matchesProgramme(rule) &&
    appliesToDirectEntryCohort(rule.cohort, student) === true
  );
  const blocked = blockedByGeneralRule || blockedByCohort;

  // Cohort-specific ONLY_AVAILABLE rules still need review: their relationship
  // with other programme allowlists cannot safely be inferred from legacy text.
  const unresolvedRestrictions = restrictions.filter((rule) =>
    hasCohort(rule) &&
    (rule.restriction_type === "ONLY_AVAILABLE" ||
      (rule.restriction_type === "NOT_AVAILABLE" &&
       matchesProgramme(rule) &&
       appliesToDirectEntryCohort(rule.cohort, student) === null))
  );

  let programmeEligible = true;
  const reasons = [];
  if (studyYear.eligible !== true) reasons.push(studyYear.eligible === false
    ? `Verified curriculum rule requires study year ${studyYear.minimum_study_year} or later`
    : "Curriculum study-year eligibility requires review");
  if (alreadyCompleted) reasons.push("Course has already been passed and cannot be selected again");
  if (mutualExclusionResult.conflicting_completed_courses.length > 0) {
  reasons.push(
    `Mutually exclusive with completed courses: ${
      mutualExclusionResult.conflicting_completed_courses.join(", ")
    }`
  );
}

if (mutualExclusionResult.conflicting_selected_courses.length > 0) {
  reasons.push(
    `Mutually exclusive with selected courses: ${
      mutualExclusionResult.conflicting_selected_courses.join(", ")
    }`
  );
}
  if (!corequisiteResult.corequisite_eligible) {
  reasons.push(
    "Missing corequisite groups: complete or select at least one alternative in each missing group"
  );
}
  if (!prerequisiteEligible) {
    reasons.push("Missing prerequisite groups: complete at least one alternative in each missing group");
  }
  if (blocked) {
    // A definite denial remains decisive, even if other rules are unknown.
    programmeEligible = false;
    reasons.push(blockedByGeneralRule
      ? "Course is not available to your programme"
      : "Course is not available to your programme and admission cohort");
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
    already_completed: alreadyCompleted,
    study_year_eligible: studyYear.eligible,
    curriculum_year_rule: studyYear,
    request_id: requestId,
    corequisite_context:
      planCourseCodes !== null
        ? "completed_and_plan_courses"
        : requestId === null
          ? "completed_courses_only"
          : "completed_and_request_selected_courses",
    prerequisite_eligible: prerequisiteEligible,
    corequisite_eligible: corequisiteResult.corequisite_eligible,
    missing_corequisite_groups:
      corequisiteResult.missing_corequisite_groups,
    programme_eligible: programmeEligible,
    mutual_exclusion_eligible:
      mutualExclusionResult.mutual_exclusion_eligible,
    conflicting_completed_courses:
      mutualExclusionResult.conflicting_completed_courses,
    conflicting_selected_courses:
      mutualExclusionResult.conflicting_selected_courses,
    can_select:
      !alreadyCompleted &&
      studyYear.eligible === true &&
      prerequisiteEligible &&
      programmeEligible === true &&
      mutualExclusionResult.mutual_exclusion_eligible,
    eligible:
      !alreadyCompleted &&
      studyYear.eligible === true &&
      prerequisiteEligible &&
      corequisiteResult.corequisite_eligible &&
      programmeEligible === true &&
      mutualExclusionResult.mutual_exclusion_eligible,
    requires_review: programmeEligible === null || studyYear.eligible === null,
    missing_prerequisite_groups: missingGroups,
    // Kept for existing clients; these are alternatives in UNSATISFIED groups,
    // not a list of courses the student must all complete.
    missing_prerequisites: [...new Set(missingGroups.flatMap((group) => group.alternatives))],
    programme_restrictions: restrictions,
    unresolved_restrictions: unresolvedRestrictions,
    message: reasons.length > 0
  ? reasons.join("; ")
  : "Prerequisite, corequisite, programme and mutual-exclusion checks passed",
  };
};
module.exports = {
  evaluateEligibility,
  EligibilityNotFoundError,
};
