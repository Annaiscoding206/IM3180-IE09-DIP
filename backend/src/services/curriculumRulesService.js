const pool = require("../config/db");
const { PlanningError } = require("./planningError");

// NULL route on a curriculum explicitly means route-independent, not a fallback.
// Exact and route-independent matches together are an ambiguity, never ranked.
async function matchCurriculum(student, db = pool) {
  if (student.admission_year == null) return null;
  const [rows] = await db.query(`SELECT curriculum_id, curriculum_key, title, programme,
    admission_year, admission_route, is_demo, description FROM programme_curriculum
    WHERE programme = ? AND admission_year = ?
      AND (admission_route IS NULL OR admission_route = ?) ORDER BY curriculum_id`,
  [student.programme, student.admission_year, student.admission_route ?? null]);
  if (rows.length > 1) throw new PlanningError(409, "Multiple curricula match this student", { code: "AMBIGUOUS_CURRICULUM" });
  return rows[0] || null;
}

async function evaluateCurriculumYear(student, courseCode, db = pool) {
  let curriculum;
  try { curriculum = await matchCurriculum(student, db); }
  catch (error) {
    if (error.details?.code !== "AMBIGUOUS_CURRICULUM") throw error;
    return { eligible: null, code: "AMBIGUOUS_CURRICULUM", minimum_study_year: null };
  }
  // No matched curriculum means no curriculum-specific rule, not a ban.
  if (!curriculum) return { eligible: true, minimum_study_year: null };
  const [rows] = await db.query(`SELECT verified_min_study_year, verification_source FROM curriculum_course
    WHERE curriculum_id = ? AND course_code = ? AND verified_min_study_year IS NOT NULL`, [curriculum.curriculum_id, courseCode]);
  if (!rows.length) return { eligible: true, minimum_study_year: null };
  const rule = rows[0];
  return { eligible: student.study_year == null ? null : student.study_year >= rule.verified_min_study_year,
    minimum_study_year: rule.verified_min_study_year, verification_source: rule.verification_source,
    curriculum_id: curriculum.curriculum_id };
}
module.exports = { matchCurriculum, evaluateCurriculumYear };
