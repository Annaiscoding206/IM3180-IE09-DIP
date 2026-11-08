// From backend: node scripts/setupLeo.cjs. Inspect before applying missing DDL.
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });
const fs = require("node:fs"), path = require("node:path");
const pool = require("../src/config/db");
async function setupLeo(db) {
  const [[database]] = await db.query("SELECT DATABASE() AS name");
  if (database.name !== "stars_companion_db") throw Error("Expected local stars_companion_db");
  const applied = [], existing = [];
  for (const file of ["05_ai_chat_history.sql", "06_leo_active_conversation.sql", "12_leo_preference_draft.sql"]) {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../database", file), "utf8").replace(/^\s*--.*$/gm, "");
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) {
      const table = statement.match(/^CREATE TABLE IF NOT EXISTS (ai_[a-z_]+)/)?.[1];
      if (!table) throw Error("Unexpected AI migration statement");
      const [rows] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]);
      if (rows.length) existing.push(table);
      else { await db.query(statement); applied.push({ file, table }); }
    }
  }
  return { applied, existing };
}
if (require.main === module) setupLeo(pool).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
module.exports = { setupLeo };
