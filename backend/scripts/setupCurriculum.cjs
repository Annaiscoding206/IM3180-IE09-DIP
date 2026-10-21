// From backend: node scripts/setupCurriculum.cjs [--migration-only]
// Only extension 10 and the isolated synthetic seed 11. Never resets old seeds.
const fs = require("node:fs");
const path = require("node:path");
const { invalidateRequestPlans } = require("../src/services/planInvalidationService");

async function applyMigration(pool) {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../database/10_programme_curriculum.sql"), "utf8").replace(/--[^\n]*/g, "");
  const db = await pool.getConnection();
  try { for (const statement of sql.split(";").filter(s => s.trim())) await db.query(statement); }
  finally { db.release(); }
}

async function seedDemoCurriculum(pool, seed) {
  const db = await pool.getConnection();
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await db.beginTransaction();
    const c = seed.curriculum;
    const [students] = await db.query(`SELECT student_id, programme, admission_year, admission_route FROM student
      WHERE student_id = ? OR (programme = ? AND admission_year = ? AND (admission_route = ? OR ? IS NULL))
      ORDER BY student_id FOR UPDATE`, [seed.student_id, c.programme, c.admission_year, c.admission_route, c.admission_route]);
    const student = students.find(s => s.student_id === seed.student_id);
    if (!student || student.programme !== c.programme) throw new Error("Demo student missing or programme differs from seed");
    if ((student.admission_year != null && student.admission_year !== c.admission_year) ||
        (student.admission_route != null && student.admission_route !== c.admission_route)) throw new Error("Existing admission data differs; refusing to overwrite it");
    const [requests] = await db.query("SELECT request_id FROM planning_request WHERE student_id IN (?) ORDER BY request_id FOR UPDATE", [students.map(s => s.student_id)]);
    let changed = 0;
    // Seed columns and identifiers come only from this checked-in setup code.
    // Existing differing data is never silently overwritten or deleted.
    async function ensure(table, keys, row) {
      const columns = Object.keys(row), where = Object.keys(keys).map(k => `${k} = ?`).join(" AND ");
      const [old] = await db.query(`SELECT ${columns.join(", ")} FROM ${table} WHERE ${where}`, Object.values(keys));
      if (old.length) {
        if (!columns.every(k => row[k] == null ? old[0][k] == null : String(row[k]) === String(old[0][k]) ||
            (typeof row[k] === "number" && row[k] === Number(old[0][k])))) throw new Error(`Existing ${table} seed data differs; refusing to overwrite it`);
        return;
      }
      await db.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, Object.values(row));
      changed++;
    }
    // Whitelist fields so this internal importer also fails closed on bad input.
    const fields = {
      programme_curriculum: ["curriculum_key", "title", "programme", "admission_year", "admission_route", "is_demo", "description"],
      curriculum_category: ["category_code", "title", "required_au"],
      curriculum_elective_group: ["category_code", "group_code", "title", "required_au"],
      curriculum_course: ["course_code", "course_title", "category_code", "group_code", "is_required", "recommended_study_year", "recommended_semester", "verified_min_study_year", "verification_source"],
    };
    function checked(table, row) {
      if (Object.keys(row).length !== fields[table].length || fields[table].some(k => !Object.hasOwn(row, k))) throw new Error(`Invalid ${table} seed fields`);
      return Object.fromEntries(fields[table].map(k => [k, row[k]]));
    }
    await ensure("programme_curriculum", { curriculum_key: c.curriculum_key }, checked("programme_curriculum", c));
    const [[{ curriculum_id }]] = await db.query("SELECT curriculum_id FROM programme_curriculum WHERE curriculum_key = ?", [c.curriculum_key]);
    for (const row of seed.categories) await ensure("curriculum_category", { curriculum_id, category_code: row.category_code }, { curriculum_id, ...checked("curriculum_category", row) });
    for (const row of seed.groups) await ensure("curriculum_elective_group", { curriculum_id, category_code: row.category_code, group_code: row.group_code }, { curriculum_id, ...checked("curriculum_elective_group", row) });
    for (const row of seed.courses) await ensure("curriculum_course", { curriculum_id, course_code: row.course_code }, { curriculum_id, ...checked("curriculum_course", row) });
    if (student.admission_year !== c.admission_year || student.admission_route !== c.admission_route) {
      await db.query("UPDATE student SET admission_year = ?, admission_route = ? WHERE student_id = ?", [c.admission_year, c.admission_route, seed.student_id]);
      changed++;
    }
    if (changed) for (const r of requests) await invalidateRequestPlans(db, r.request_id);
    await db.commit();
    return { curriculum_id, curriculum_key: c.curriculum_key, changed_rows: changed,
      invalidated_request_ids: changed ? requests.map(r => r.request_id) : [] };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const pool = require("../src/config/db");
  (async () => {
    if (process.env.DB_NAME !== "stars_companion_db") throw new Error("Expected local stars_companion_db");
    if (process.argv.slice(2).some(arg => arg !== "--migration-only")) throw new Error("Only --migration-only is supported");
    await applyMigration(pool);
    console.log("Programme Curriculum extension applied.");
    if (!process.argv.includes("--migration-only")) {
      const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../database/11_programme_curriculum_demo_data.json"), "utf8"));
      console.log(JSON.stringify(await seedDemoCurriculum(pool, seed), null, 2));
    }
  })().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { applyMigration, seedDemoCurriculum };
