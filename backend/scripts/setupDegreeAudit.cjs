// From backend: node scripts/setupDegreeAudit.cjs [--migration-only]
// Applies only extension 08, then repeatable demo attempts via the shared
// importer/invalidation transaction. Never reruns base schema or old seeds.
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");
const { importDemoRecords } = require("../src/services/degreeAuditService");

(async () => {
  if (process.env.DB_NAME !== "stars_companion_db") throw new Error("Expected local stars_companion_db");
  if (process.argv.slice(2).some(arg => arg !== "--migration-only")) throw new Error("Only --migration-only is supported");
  const db = await pool.getConnection();
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../database/08_degree_audit.sql"), "utf8").replace(/--[^\n]*/g, "");
    for (const statement of sql.split(";").filter(s => s.trim())) await db.query(statement);
    console.log("Degree Audit migration applied; legacy completion history preserved.");
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  if (!process.argv.includes("--migration-only")) {
    const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../database/09_degree_audit_demo_data.json"), "utf8"));
    console.log(JSON.stringify(await importDemoRecords(seed.student_id, seed.records), null, 2));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
