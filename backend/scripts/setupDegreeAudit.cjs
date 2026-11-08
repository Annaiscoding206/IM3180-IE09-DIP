// From backend: node scripts/setupDegreeAudit.cjs [--migration-only | --legacy-au-only]
// Applies only extension 08, explicit legacy AU, then repeatable demo attempts
// via the shared importer/invalidation transaction. Never reruns base schema or old seeds.
const fs = require("node:fs");
const path = require("node:path");

// Credit-only enrichment of existing legacy PASSED records. Never create a new
// attempt, infer historical metadata or overwrite a different known credit.
async function applyLegacyEarnedAu(pool, seed) {
  const credits = seed.legacy_earned_au;
  if (typeof seed.student_id !== "string" || !seed.student_id.trim() || !Array.isArray(credits) ||
      credits.some(row => !row || Object.keys(row).length !== 2 ||
        typeof row.course_code !== "string" || !/^[A-Z0-9]{1,10}$/.test(row.course_code) ||
        typeof row.earned_au !== "number" || !Number.isFinite(row.earned_au) || row.earned_au < 0 || row.earned_au > 9999.99 ||
        Math.abs(row.earned_au * 100 - Math.round(row.earned_au * 100)) > 1e-8) ||
      new Set(credits.map(row => row.course_code)).size !== credits.length) {
    throw new Error("Invalid legacy earned-AU seed");
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [students] = await db.query("SELECT student_id FROM student WHERE student_id = ? FOR UPDATE", [seed.student_id]);
    if (!students.length) throw new Error("Legacy earned-AU student not found");
    let changed = 0;
    for (const credit of credits) {
      const [rows] = await db.query(`SELECT record_id, course_code, source, result, earned_au FROM academic_record
        WHERE student_id = ? AND source_key = ? FOR UPDATE`, [seed.student_id, `legacy:${credit.course_code}`]);
      const row = rows[0];
      if (!row || row.course_code !== credit.course_code || row.source !== "LEGACY_COMPLETED" || row.result !== "PASSED") {
        throw new Error(`Expected existing legacy PASSED record for ${credit.course_code}; run migration 08 first`);
      }
      if (row.earned_au !== null) {
        if (Number(row.earned_au) !== credit.earned_au) throw new Error(`Known earned AU differs for ${credit.course_code}; refusing to overwrite it`);
        continue;
      }
      await db.query("UPDATE academic_record SET earned_au = ? WHERE record_id = ?", [credit.earned_au, row.record_id]);
      changed++;
    }
    // Only historical credit changes: PASSED membership, prerequisites and plan
    // selections are unchanged. Curriculum computes AU from these rows on read;
    // there is no cached credit total or plan metadata to reset.
    await db.commit();
    return { student_id: seed.student_id, changed_records: changed };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

async function applyMigration(pool) {
  const db = await pool.getConnection();
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../database/08_degree_audit.sql"), "utf8").replace(/--[^\n]*/g, "");
    for (const statement of sql.split(";").filter(s => s.trim())) await db.query(statement);
    console.log("Degree Audit migration applied; legacy completion history preserved.");
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const pool = require("../src/config/db");
  const { importDemoRecords, getCompletionSummary } = require("../src/services/degreeAuditService");
  (async () => {
    if (process.env.DB_NAME !== "stars_companion_db") throw new Error("Expected local stars_companion_db");
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !["--migration-only", "--legacy-au-only"].includes(arg))) {
      throw new Error("Use --migration-only or --legacy-au-only, or no option for full Degree Audit setup");
    }
    if (!args.includes("--legacy-au-only")) await applyMigration(pool);
    if (!args.includes("--migration-only")) {
      const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../database/09_degree_audit_demo_data.json"), "utf8"));
      console.log(JSON.stringify(await applyLegacyEarnedAu(pool, seed), null, 2));
      if (!args.includes("--legacy-au-only")) console.log(JSON.stringify(await importDemoRecords(seed.student_id, seed.records), null, 2));
      console.log(JSON.stringify(await getCompletionSummary(seed.student_id), null, 2));
    }
  })().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { applyLegacyEarnedAu, applyMigration };
