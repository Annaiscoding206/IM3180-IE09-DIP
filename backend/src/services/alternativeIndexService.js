const plans = require("./planService");
const { validationReasons, explainReasons } = require("./planningExplanationService");

async function getAlternatives(planId, courseCode, studentId, query = {}) {
  const id = plans.integer(planId, "planId");
  if (typeof studentId !== "string" || !studentId.trim()) throw new plans.PlanningError(401, "Student identity required");
  if (typeof courseCode !== "string" || !/^[A-Z0-9]{1,10}$/i.test(courseCode.trim())) {
    throw new plans.PlanningError(400, "courseCode must contain 1–10 letters or digits");
  }
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some(key => key !== "candidate_index_no")) {
    throw new plans.PlanningError(400, "Only optional candidate_index_no is accepted");
  }
  const course = courseCode.trim().toUpperCase();
  const explicit = Object.hasOwn(query, "candidate_index_no");
  const preferred = explicit ? plans.integer(query.candidate_index_no, "candidate_index_no") : null;
  // Read-only operation. Parent lock provides one consistent request/plan view
  // while other supported writers wait; no ranking, status or index is updated.
  return plans.transaction(async db => {
    const [owners] = await db.query("SELECT request_id FROM plan WHERE plan_id = ?", [id]);
    if (!owners.length) throw new plans.PlanningError(404, "Plan not found for this student");
    const [requests] = await db.query("SELECT request_id FROM planning_request WHERE request_id = ? AND student_id = ? FOR UPDATE",
      [owners[0].request_id, studentId]);
    if (!requests.length) throw new plans.PlanningError(404, "Plan not found for this student");
    const plan = await plans.getPlan(id, db, true);
    const [selected] = await db.query(
      `SELECT course_code
       FROM plan_selected_course
       WHERE plan_id = ?
         AND course_code = ?`,
      [plan.plan_id, course]
    );

    if (!selected.length) {
      throw new plans.PlanningError(
        422,
        "Course must be selected in this plan"
      );
    }
    const [indexes] = await db.query("SELECT course_code, index_no, locked FROM plan_course WHERE plan_id = ? ORDER BY course_code", [id]);
    const current = indexes.find(index => index.course_code.toUpperCase() === course);
    if (!explicit && !current) throw new plans.PlanningError(400, "No chosen index exists; supply candidate_index_no explicitly");
    const evaluated = preferred ?? current.index_no;
    const [pair] = await db.query("SELECT course_code, index_no FROM course_info WHERE course_code = ? AND index_no = ?", [course, evaluated]);
    if (!pair.length) throw new plans.PlanningError(404, "Candidate course/index pair not found");
    const remaining = indexes.filter(index => index.course_code.toUpperCase() !== course);
    const validate = index => plans.validatePlanContents(plan, [...remaining, index], db);
    const validation = await validate(pair[0]);
    const initialReasons = validationReasons(validation, course);
    const locked = Boolean(current?.locked);
    if (locked && current.index_no === evaluated && !validation.can_finalize && initialReasons.some(reason =>
      reason.course_code === course || reason.conflicting_course_code === course)) {
      initialReasons.push({ code: "LOCKED_INDEX_INVALID", course_code: course, index_no: evaluated, requires_student_action: true,
        explanation: "The locked index fails validation in this plan. Suggestions do not replace it; student action is required." });
    }
    const explanation = explainReasons(initialReasons);
    const [candidates] = await db.query(`SELECT course_code, index_no FROM course_info
      WHERE course_code = ? AND academic_year = ? AND semester = ? AND index_no <> ? ORDER BY index_no`,
      [course, plan.academic_year, plan.semester, evaluated]);
    const alternatives = [], rejected = [], seen = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate.index_no)) continue;
      seen.add(candidate.index_no);
      // Whole-plan validation checks every slot, all other indexes' terms,
      // completeness, clashes, academic/corequisite/exclusion rules and hard
      // constraints. A locally clear candidate is insufficient on its own.
      const result = await validate(candidate);
      if (result.can_finalize) alternatives.push({ ...candidate, auto_applied: false,
        requires_student_action: true, changes_locked_index: locked && candidate.index_no !== current.index_no,
        validation: result });
      else rejected.push({ ...candidate, ...explainReasons(validationReasons(result, course)) });
    }
    for (const candidate of alternatives) explanation.suggestions.push({ action: "CHOOSE_INDEX", course_code: course,
      index_no: candidate.index_no, reason_ids: explanation.reasons.map(reason => reason.reason_id),
      requires_student_action: true, auto_applied: false, changes_locked_index: candidate.changes_locked_index,
      requires_revalidation: true, validated_for_current_snapshot: true,
      explanation: locked ? "This alternative passes complete-plan validation. Changing the stored locked index requires explicit student action."
        : "This alternative passes complete-plan validation with every other chosen index unchanged." });
    return { plan_id: id, request_id: plan.request_id, course_code: course, current_index_no: current?.index_no ?? null,
      candidate_index_no: preferred, evaluated_index_no: evaluated, evaluation_source: explicit ? "explicit_candidate" : "stored_index",
      locked, locked_index_no: locked ? current.index_no : null, auto_applied: false,
      requires_student_action: locked, validation_scope: "complete_plan_with_other_indexes_unchanged",
      evaluated_plan_valid: validation.can_finalize, validation, ...explanation,
      alternatives, rejected_alternatives: rejected, alternative_count: alternatives.length,
      status: alternatives.length ? "alternatives_available" : "no_valid_alternative" };
  });
}
module.exports = { getAlternatives };
