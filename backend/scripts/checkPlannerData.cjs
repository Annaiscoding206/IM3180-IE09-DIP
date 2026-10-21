// From backend: node scripts/checkPlannerData.cjs <request_id>
// Read-only inventory of the current local request; does not seed class times.
const path = require("node:path");

async function readPlannerData(db, requestId) {
  const [requests] = await db.query(
    "SELECT request_id, student_id, academic_year, semester FROM planning_request WHERE request_id = ?", [requestId]);
  if (!requests.length) throw Error("Planning request not found");
  const request = requests[0];
  const [indexes] = await db.query(
    "SELECT rpc.course_code, ci.index_no, COUNT(cs.slot_id) AS session_count " +
    "FROM planning_request_course rpc " +
    "LEFT JOIN course_info ci ON ci.course_code = rpc.course_code AND ci.academic_year = ? AND ci.semester = ? " +
    "LEFT JOIN class_slots cs ON cs.course_code = ci.course_code AND cs.index_no = ci.index_no " +
    "WHERE rpc.request_id = ? GROUP BY rpc.course_code, ci.index_no ORDER BY rpc.course_code, ci.index_no",
    [request.academic_year, request.semester, request.request_id]);
  const [planIndexes] = await db.query(
    "SELECT p.plan_id, p.plan_name, p.status, pc.course_code, pc.index_no, pc.locked, " +
    "(rpc.course_code IS NOT NULL) AS course_selected, " +
    "EXISTS (SELECT 1 FROM academic_record ar WHERE ar.student_id = pr.student_id " +
    "AND ar.course_code = pc.course_code AND ar.result = 'PASSED') AS already_completed " +
    "FROM plan p JOIN planning_request pr ON pr.request_id = p.request_id " +
    "JOIN plan_course pc ON pc.plan_id = p.plan_id " +
    "LEFT JOIN planning_request_course rpc ON rpc.request_id = p.request_id AND rpc.course_code = pc.course_code " +
    "WHERE p.request_id = ? ORDER BY p.plan_id, pc.course_code", [request.request_id]);
  return { request, indexes, planIndexes };
}

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const pool = require("../src/config/db");
  (async () => {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0]) || Number(args[0]) > 2147483647) {
      throw Error("Usage: node scripts/checkPlannerData.cjs <positive request_id>");
    }
    const report = await readPlannerData(pool, Number(args[0]));
    console.log("Planning request");
    console.table([report.request]);
    console.log("Catalogue indexes and stored session counts for the request term");
    console.table(report.indexes);
    console.log("Zero sessions means timetable data is missing. Session counts alone do not establish validation or data completeness.");
    console.log("Existing plan/index choices (archived rows are historical)");
    console.table(report.planIndexes);
  })().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { readPlannerData };
