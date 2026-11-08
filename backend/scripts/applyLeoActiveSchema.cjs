
require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");

async function main() {
  try {
    const sqlPath = path.join(
      __dirname,
      "../../database/06_leo_active_conversation.sql"
    );

    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    const [tables] = await pool.query(
      "SHOW TABLES LIKE 'ai_active_conversation'"
    );

    if (tables.length !== 1) {
      throw new Error("Active conversation table not found.");
    }

    console.log(
      "PASS: Active conversation table created."
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
