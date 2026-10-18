
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");

const sqlPath = path.join(
  __dirname,
  "../../database/05_ai_chat_history.sql"
);

async function main() {
  // 1. Read the SQL file.
  const sql = fs.readFileSync(sqlPath, "utf8");

  // 2. Remove single-line SQL comments and
  // split our two CREATE TABLE statements.
  const statements = sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  // Safety: only run our two expected statements.
  if (
    statements.length !== 2 ||
    !statements[0].startsWith(
      "CREATE TABLE IF NOT EXISTS ai_conversation"
    ) ||
    !statements[1].startsWith(
      "CREATE TABLE IF NOT EXISTS ai_message"
    )
  ) {
    throw new Error(
      "Unexpected SQL content. Schema was not applied."
    );
  }

  // 3. Verify the active database.
  const [[database]] = await pool.query(
    "SELECT DATABASE() AS name"
  );

  console.log("Connected database:", database.name);

  // 4. Create the new tables.
  for (const statement of statements) {
    await pool.query(statement);
  }

  // 5. Verify both tables exist.
  const [tables] = await pool.query(`
    SELECT
      TABLE_NAME,
      ENGINE,
      TABLE_COLLATION
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
        'ai_conversation',
        'ai_message'
      )
    ORDER BY TABLE_NAME
  `);

  console.log("\nCreated AI chat tables:");
  console.table(tables);

  if (tables.length !== 2) {
    throw new Error(
      "Chat history tables were not created correctly."
    );
  }

  console.log("\nAI chat history schema is ready!");
}

main()
  .catch((error) => {
    console.error("Schema setup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
