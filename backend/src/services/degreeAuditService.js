const pool = require("../config/db");
const { PlanningError } = require("./planningError");
const { invalidateRequestPlans } = require("./planInvalidationService");

const fields = ["source_key", "course_code", "course_title", "academic_year", "semester", "result", "grade", "earned_au"];
const normalize = row => ({ ...row, earned_au: row.earned_au == null ? null : Number(row.earned_au) });

async function readRecords(studentId, db = pool) {
  const [rows] = await db.query(`SELECT record_id, student_id, course_code, course_title, academic_year,
    semester, result, grade, earned_au, source, source_key FROM academic_record
    WHERE student_id = ? ORDER BY academic_year, semester, course_code, record_id`, [studentId]);
  return rows.map(normalize);
}

// The one completion/credit rule used by eligibility, profiles and Explorer.
// Attempts remain intact. Each distinct PASSED course earns its maximum KNOWN
// passed-attempt AU once, never the sum of repeated attempts. NULL credit is
// unknown, not zero: return the known subtotal and an explicit completeness flag.
function passedCourseCredits(records) {
  const passed = new Map();
  for (const row of records) {
    if (row.result !== "PASSED") continue;
    const code = row.course_code.trim().toUpperCase();
    const previous = passed.get(code);
    const au = row.earned_au == null ? null : Number(row.earned_au);
    passed.set(code, au == null ? previous ?? null : Math.max(previous ?? 0, au));
  }
  return passed;
}

function summarizeRecords(records) {
  const passed = passedCourseCredits(records);
  const unknown = [...passed].filter(([, au]) => au == null).map(([code]) => code).sort();
  return { record_count: records.length,
    passed_attempts: records.filter(r => r.result === "PASSED").length,
    failed_attempts: records.filter(r => r.result === "FAILED").length,
    in_progress_attempts: records.filter(r => r.result === "IN_PROGRESS").length,
    passed_course_codes: [...passed.keys()].sort(), passed_course_count: passed.size,
    earned_au: [...passed.values()].reduce((sum, au) => sum + Math.round((au ?? 0) * 100), 0) / 100,
    earned_au_complete: unknown.length === 0, unknown_au_course_codes: unknown };
}

async function getCompletionSummary(studentId, db = pool) {
  return summarizeRecords(await readRecords(studentId, db));
}

function validateFilters(query) {
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some(k => !["academic_year", "semester", "result"].includes(k))) {
    throw new PlanningError(400, "Only academic_year, semester and result filters are accepted");
  }
  if (query.academic_year !== undefined && (typeof query.academic_year !== "string" || !/^\d{4}-\d{4}$/.test(query.academic_year) ||
      Number(query.academic_year.slice(5)) !== Number(query.academic_year.slice(0, 4)) + 1)) throw new PlanningError(400, "academic_year must be consecutive years YYYY-YYYY");
  if (query.semester !== undefined && (typeof query.semester !== "string" || !/^[1-3]$/.test(query.semester))) throw new PlanningError(400, "semester must be 1, 2 or 3");
  if (query.result !== undefined && !["PASSED", "FAILED", "IN_PROGRESS"].includes(query.result)) throw new PlanningError(400, "Invalid result filter");
  return query;
}

async function getDegreeAudit(studentId, trustedStudentId, query = {}) {
  const filters = validateFilters(query);
  if (typeof trustedStudentId !== "string" || !trustedStudentId.trim()) throw new PlanningError(401, "Student identity required");
  if (typeof studentId !== "string" || studentId.toUpperCase() !== trustedStudentId.toUpperCase()) throw new PlanningError(404, "Student not found for this identity");
  const [students] = await pool.query("SELECT student_id FROM student WHERE student_id = ?", [studentId]);
  if (!students.length) throw new PlanningError(404, "Student not found");
  // One read supplies both filtered records and overall completion, avoiding
  // contradictory summaries if an import commits between separate reads.
  const all = await readRecords(students[0].student_id);
  const records = all.filter(row => (filters.academic_year === undefined || row.academic_year === filters.academic_year) &&
    (filters.semester === undefined || row.semester === Number(filters.semester)) && (filters.result === undefined || row.result === filters.result));
  const summary = summarizeRecords(all);
  return { student_id: students[0].student_id, filters, records, summary_scope: "all_academic_records",
    passed_course_codes: summary.passed_course_codes, earned_au: summary.earned_au, earned_au_complete: summary.earned_au_complete,
    summary, filtered_summary: summarizeRecords(records) };
}

function validateDemoRecord(row) {
  if (!row || typeof row !== "object" || Array.isArray(row) || fields.some(k => !Object.hasOwn(row, k)) || Object.keys(row).some(k => !fields.includes(k))) {
    throw new PlanningError(400, "Demo record must contain exactly the academic attempt fields");
  }
  if (typeof row.source_key !== "string" || !/^demo:[A-Za-z0-9:_-]{1,95}$/.test(row.source_key) ||
      typeof row.course_code !== "string" || !/^[A-Z0-9]{1,10}$/.test(row.course_code)) throw new PlanningError(400, "Invalid demo attempt key or course code");
  for (const [key, max] of [["course_title", 255], ["grade", 10]]) {
    if (row[key] !== null && (typeof row[key] !== "string" || !row[key].trim() || row[key].length > max)) throw new PlanningError(400, `Invalid ${key}`);
  }
  if (!['PASSED', 'FAILED', 'IN_PROGRESS'].includes(row.result) || (row.academic_year !== null && typeof row.academic_year !== "string")) throw new PlanningError(400, "Invalid result or academic year");
  validateFilters({ ...(row.academic_year === null ? {} : { academic_year: row.academic_year }), result: row.result });
  if (row.semester !== null && (!Number.isInteger(row.semester) || row.semester < 1 || row.semester > 3)) throw new PlanningError(400, "Invalid semester");
  if (row.earned_au !== null && (typeof row.earned_au !== "number" || !Number.isFinite(row.earned_au) || row.earned_au < 0 || row.earned_au > 9999.99 ||
      Math.abs(row.earned_au * 100 - Math.round(row.earned_au * 100)) > 1e-8)) throw new PlanningError(400, "earned_au must be nonnegative with at most two decimal places, or null");
  if (row.result !== "PASSED" && row.earned_au !== 0) throw new PlanningError(400, "Non-passed attempts must earn zero AU");
  return Object.fromEntries(fields.map(field => [field, row[field]]));
}

// Internal seeded-demo importer only: no public mutation endpoint. Stable keys
// update a known attempt, while distinct keys preserve all attempts. No deletes.
// Optional connection is internal only; the caller owns commit/rollback.
async function importDemoRecords(studentId, records, connection = null) {
  if (!Array.isArray(records)) throw new PlanningError(400, "records must be an array");
  const normalized = records.map(validateDemoRecord);
  if (new Set(normalized.map(row => row.source_key.toLowerCase())).size !== normalized.length) throw new PlanningError(400, "Duplicate attempt keys");
  const db = connection || await pool.getConnection();
  try {
    if (!connection) {
      await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await db.beginTransaction();
    }
    // Student lock serializes imports and new planning-request FK inserts.
    // Existing request rows are locked in order BEFORE any plan writes.
    const [students] = await db.query("SELECT student_id FROM student WHERE student_id = ? FOR UPDATE", [studentId]);
    if (!students.length) throw new PlanningError(404, "Student not found");
    const [requests] = await db.query("SELECT request_id FROM planning_request WHERE student_id = ? ORDER BY request_id FOR UPDATE", [studentId]);
    const previous = new Map((await readRecords(studentId, db)).map(row => [row.source_key.toLowerCase(), row]));
    let changed = 0;
    for (const row of normalized) {
      const old = previous.get(row.source_key.toLowerCase());
      if (old && (old.source !== "DEMO" || old.course_code !== row.course_code)) throw new PlanningError(409, "Cannot reassign an existing attempt or overwrite legacy history");
      if (old && fields.every(field => old[field] === row[field])) continue;
      if (old) await db.query(`UPDATE academic_record SET ${fields.map(k => `${k} = ?`).join(", ")} WHERE record_id = ?`, [...fields.map(k => row[k]), old.record_id]);
      else await db.query(`INSERT INTO academic_record (student_id, source, ${fields.join(", ")}) VALUES (?, 'DEMO', ${fields.map(() => "?").join(", ")})`, [studentId, ...fields.map(k => row[k])]);
      changed++;
    }
    if (changed) for (const request of requests) await invalidateRequestPlans(db, request.request_id);
    const summary = await getCompletionSummary(studentId, db);
    if (!connection) await db.commit();
    return { student_id: studentId, changed_records: changed, invalidated_request_ids: changed ? requests.map(r => r.request_id) : [], summary };
  } catch (error) { if (!connection) await db.rollback(); throw error; }
  finally { if (!connection) db.release(); }
}

module.exports = { passedCourseCredits, readRecords, summarizeRecords, getCompletionSummary, getDegreeAudit, importDemoRecords, validateDemoRecord };
