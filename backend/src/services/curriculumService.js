const pool = require("../config/db");
const { PlanningError } = require("./planningError");
const { readRecords, passedCourseCredits, summarizeRecords } = require("./degreeAuditService");
const { matchCurriculum } = require("./curriculumRulesService");
const { evaluateEligibility, EligibilityNotFoundError } = require("./eligibilityService");

const money = n => Math.round(n * 100) / 100;
const courseStatus = (code, passed, planned) => passed.has(code) ? "COMPLETED" : planned.has(code) ? "PLANNED" : "NOT_YET_TAKEN";

// Categories include their child groups (roll-up, not additional credit).
// One curriculum_course row per code ensures mutually exclusive allocation.
function calculateProgress(categories, groups, courses, records, plannedCodes = []) {
  const credits = passedCourseCredits(records), planned = new Set(plannedCodes);
  const annotated = courses.map(row => ({ ...row, is_required: Boolean(row.is_required),
    status: courseStatus(row.course_code, credits, planned),
    completed_au: credits.has(row.course_code) ? credits.get(row.course_code) : 0 }));
  function bucket(requiredAu, members) {
    const unknown = members.filter(c => c.status === "COMPLETED" && c.completed_au == null).map(c => c.course_code);
    const completed = money(members.reduce((sum, c) => sum + (c.completed_au ?? 0), 0));
    const remaining = money(Math.max(0, Number(requiredAu) - completed));
    const required = members.filter(c => c.is_required);
    const missing = required.filter(c => c.status !== "COMPLETED").map(c => c.course_code);
    return { required_au: Number(requiredAu), completed_au: completed, remaining_au: remaining,
      au_complete: unknown.length === 0, unknown_au_course_codes: unknown,
      remaining_au_is_upper_bound: unknown.length > 0,
      completed_required_courses: required.filter(c => c.status === "COMPLETED").map(c => c.course_code),
      remaining_required_courses: missing,
      requirements_satisfied: missing.length ? false : remaining === 0 ? true : unknown.length ? null : false };
  }
  const result = categories.map(category => {
    const members = annotated.filter(c => c.category_code === category.category_code);
    const electiveGroups = groups.filter(g => g.category_code === category.category_code).map(g => ({ ...g,
      ...bucket(g.required_au, members.filter(c => c.group_code === g.group_code)) }));
    const progress = bucket(category.required_au, members);
    const checks = [progress.requirements_satisfied, ...electiveGroups.map(g => g.requirements_satisfied)];
    return { ...category, ...progress, requirements_satisfied: checks.includes(false) ? false : checks.includes(null) ? null : true,
      elective_groups: electiveGroups };
  });
  const summary = bucket(categories.reduce((n, c) => n + Number(c.required_au), 0), annotated);
  const checks = result.map(c => c.requirements_satisfied);
  summary.requirements_satisfied = checks.includes(false) ? false : checks.includes(null) ? null : true;
  // Surplus in one bucket cannot discharge another bucket's deficit.
  summary.remaining_au = money(result.reduce((n, c) => n + c.remaining_au, 0));
  return { categories: result, courses: annotated, summary,
    unallocated_passed_course_codes: [...credits.keys()].filter(code => !courses.some(c => c.course_code === code)).sort() };
}

function requestFilter(query) {
  if (!query || Object.keys(query).some(k => k !== "request_id")) throw new PlanningError(400, "Only request_id is accepted");
  if (query.request_id === undefined) return null;
  if (typeof query.request_id !== "string" || !/^[1-9]\d*$/.test(query.request_id) || Number(query.request_id) > 2147483647) {
    throw new PlanningError(400, "request_id must be a positive integer");
  }
  return Number(query.request_id);
}

async function loadContext(studentId, requestId, db) {
  const [students] = await db.query(`SELECT student_id, programme, study_year, admission_year, admission_route
    FROM student WHERE student_id = ?`, [studentId]);
  if (!students.length) throw new PlanningError(404, "Student not found", { code: "STUDENT_NOT_FOUND" });
  const student = students[0];
  const [requests] = await db.query(`SELECT request_id, academic_year, semester FROM planning_request WHERE student_id = ?
    ${requestId == null ? "ORDER BY created_at DESC, request_id DESC LIMIT 1" : "AND request_id = ?"}`,
  requestId == null ? [studentId] : [studentId, requestId]);
  if (requestId != null && !requests.length) throw new PlanningError(404, "Planning request not found for this student");
  const request = requests[0] || null;
  let planned = [];
  if (request) {
    const [rows] = await db.query(`SELECT course_code FROM planning_request_course WHERE request_id = ?
      UNION SELECT pc.course_code FROM plan_course pc JOIN plan p ON p.plan_id = pc.plan_id
      WHERE p.request_id = ? AND p.status <> 'ARCHIVED' ORDER BY course_code`, [request.request_id, request.request_id]);
    planned = rows.map(r => r.course_code);
  }
  const records = await readRecords(studentId, db);
  let curriculum = null, matchError = null;
  try { curriculum = await matchCurriculum(student, db); }
  catch (error) { if (error.details?.code !== "AMBIGUOUS_CURRICULUM") throw error; matchError = error; }
  if (!curriculum && !matchError) matchError = new PlanningError(404, "No curriculum matches the explicit programme, admission year and route", { code: "NO_CURRICULUM" });
  return { student, request, records, planned, curriculum, matchError };
}

async function readDefinition(curriculumId, db) {
  const [categories] = await db.query("SELECT category_code, title, required_au FROM curriculum_category WHERE curriculum_id = ? ORDER BY category_code", [curriculumId]);
  const [groups] = await db.query("SELECT category_code, group_code, title, required_au FROM curriculum_elective_group WHERE curriculum_id = ? ORDER BY category_code, group_code", [curriculumId]);
  const [courses] = await db.query(`SELECT course_code, course_title, category_code, group_code, is_required,
    recommended_study_year, recommended_semester, verified_min_study_year, verification_source
    FROM curriculum_course WHERE curriculum_id = ? ORDER BY category_code, group_code, course_code`, [curriculumId]);
  return { categories, groups, courses };
}

async function snapshot(work) {
  const db = await pool.getConnection();
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

async function responseFromContext(context, db, includeEligibility) {
  const { student, request, records, planned, curriculum, matchError } = context;
  if (matchError) throw matchError;
  const definition = await readDefinition(curriculum.curriculum_id, db);
  const progress = calculateProgress(definition.categories, definition.groups, definition.courses, records, planned);
  if (includeEligibility) for (const course of progress.courses) {
    try {
      course.eligibility = await evaluateEligibility(student.student_id, course.course_code, db, request?.request_id ?? null);
      course.eligible = course.eligibility.eligible;
      course.can_select = course.eligibility.can_select;
    } catch (error) {
      if (!(error instanceof EligibilityNotFoundError)) throw error;
      course.eligible = null;
      course.can_select = false;
      course.eligibility = { code: "COURSE_NOT_IN_CATALOGUE", message: "Eligibility cannot be checked for this historical or synthetic course" };
    }
  }
  return { student_id: student.student_id, matching: { programme: student.programme,
    admission_year: student.admission_year, admission_route: student.admission_route }, curriculum,
    planning_context: { selection: "selected courses and non-archived plan courses", request,
      default_scope: "latest_created_request" }, recommendations_are_advisory: true,
    credit_allocation: "one_course_one_bucket; categories roll up their groups; known passed AU only",
    ...progress, degree_audit_summary: summarizeRecords(records) };
}

async function getStudentCurriculum(studentId, trustedId, query = {}) {
  if (typeof trustedId !== "string" || !trustedId.trim()) throw new PlanningError(401, "Student identity required");
  if (typeof studentId !== "string" || studentId.toUpperCase() !== trustedId.toUpperCase()) throw new PlanningError(404, "Student not found for this identity");
  const requestId = requestFilter(query);
  return snapshot(async db => responseFromContext(await loadContext(studentId, requestId, db), db, true));
}

// Additive integration for existing profile/catalogue responses. An unmatched or
// ambiguous curriculum is explicit without hiding existing profile/course data.
async function getCurriculumOverview(studentId) {
  return snapshot(async db => {
    const context = await loadContext(studentId, null, db);
    if (context.matchError) return { code: context.matchError.details.code, message: context.matchError.message };
    const response = await responseFromContext(context, db, false);
    return { curriculum: response.curriculum, summary: response.summary, categories: response.categories,
      planning_context: response.planning_context };
  });
}
async function getCourseAnnotations(studentId) {
  return snapshot(async db => {
    const context = await loadContext(studentId, null, db);
    const passed = passedCourseCredits(context.records), planned = new Set(context.planned);
    const definition = context.curriculum ? await readDefinition(context.curriculum.curriculum_id, db) : { courses: [] };
    const courses = new Map(definition.courses.map(c => [c.course_code, c]));
    return course => {
      const code = course.course_code.toUpperCase(), requirement = courses.get(code);
      return { ...course, is_completed: passed.has(code), completion_status: passed.has(code) ? "Completed" : "Not completed",
        curriculum_status: courseStatus(code, passed, planned), curriculum_category: requirement?.category_code ?? null,
        curriculum_group: requirement?.group_code ?? null, curriculum_match: context.matchError?.details.code ?? "MATCHED",
        planning_request_id: context.request?.request_id ?? null };
    };
  });
}
module.exports = { calculateProgress, courseStatus, getStudentCurriculum, getCurriculumOverview, getCourseAnnotations };
