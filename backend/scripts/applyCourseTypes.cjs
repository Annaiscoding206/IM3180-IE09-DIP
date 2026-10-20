
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");

async function main() {
  const sqlPath = path.join(
    __dirname,
    "../../database/05_course_types.sql"
  );

  const sql = fs.readFileSync(sqlPath, "utf8");

  // Remove SQL comment lines.
  const cleanedSql = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // Run each SQL statement separately.
  const statements = cleanedSql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const connection = await pool.getConnection();

  try {
    for (const statement of statements) {
      await connection.query(statement);
    }

    const [rows] = await connection.query(
      "SELECT COUNT(*) AS total FROM course_type"
    );

    console.log("PASS: Course type migration applied.");
    console.log("Course type records:", rows[0].total);
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
