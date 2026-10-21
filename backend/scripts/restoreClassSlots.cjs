
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});

const pool = require("../src/config/db");

const TARGET_COURSES = [
  "CS2024",
  "DA1000",
  "IE3014",
  "IE3102",
  "MH1811",
];

const apply = process.argv[2] === "--apply";

if (process.argv.length > 3 ||
    (process.argv[2] && !apply)) {
  console.error("Usage: node restoreClassSlots.cjs [--apply]");
  process.exit(1);
}


const sameSlot = [
  "c.course_code = s.course_code",
  "c.index_no = s.index_no",
  "c.class_type = s.class_type",
  "c.day_of_week = s.day_of_week",
  "c.start_time = s.start_time",
  "c.end_time = s.end_time",
  "c.teaching_weeks <=> s.teaching_weeks",
].join(" AND ");

const isMissing = `NOT EXISTS (
  SELECT 1 FROM class_slots c WHERE ${sameSlot}
)`;

async function main() {
  const sqlPath = path.resolve(
    __dirname,
    "../../database/02_course_data.sql"
  );

  const sql = fs.readFileSync(sqlPath, "utf8");

  const match = sql.match(
    /INSERT\s+INTO\s+`?class_slots`?\s+VALUES\s*[\s\S]*?;/i
  );

  if (!match) {
    throw new Error("class_slots INSERT not found in SQL file");
  }

  const connection = await pool.getConnection();

  try {
    const [[database]] = await connection.query(
      "SELECT DATABASE() AS database_name"
    );

    console.log("Connected database:", database.database_name);

    // Temporary staging table; does not alter permanent data.
    await connection.query(
      "CREATE TEMPORARY TABLE repair_slots LIKE class_slots"
    );

    const seedInsert = match[0].replace(
      /INSERT\s+INTO\s+`?class_slots`?\s+VALUES/i,
      "INSERT INTO repair_slots VALUES"
    );

    await connection.query(seedInsert);

    const [summary] = await connection.query(`
      SELECT
        s.course_code,
        COUNT(*) AS source_sessions,
        SUM(CASE WHEN ${isMissing}
            THEN 1 ELSE 0 END) AS missing_sessions
      FROM repair_slots s
      WHERE s.course_code IN (?)
      GROUP BY s.course_code
      ORDER BY s.course_code
    `, [TARGET_COURSES]);

    console.log("\nTimetable repair preview:");
    console.table(summary);
    const [comparison] = await connection.query(`
        SELECT
            'SQL_FILE' AS source,
            course_code, index_no, class_type, class_group,
            day_of_week, start_time, end_time, venue,
            teaching_weeks
        FROM repair_slots
        WHERE (course_code = 'IE3014' AND index_no = 32423)
            OR (course_code = 'MH1811' AND index_no = 50001)

        UNION ALL

        SELECT
            'LIVE_DB' AS source,
            course_code, index_no, class_type, class_group,
            day_of_week, start_time, end_time, venue,
            teaching_weeks
        FROM class_slots
        WHERE (course_code = 'IE3014' AND index_no = 32423)
            OR (course_code = 'MH1811' AND index_no = 50001)

        ORDER BY course_code, index_no, source
        `);

        console.log("\nExisting vs SQL source:");
        console.table(comparison);


    const [invalid] = await connection.query(`
      SELECT DISTINCT s.course_code, s.index_no
      FROM repair_slots s
      LEFT JOIN course_info ci
        ON ci.course_code = s.course_code
        AND ci.index_no = s.index_no
      WHERE s.course_code IN (?)
        AND ci.course_code IS NULL
    `, [TARGET_COURSES]);

    if (invalid.length) {
      console.log("Missing parent course/index records:");
      console.table(invalid);
    }

    if (!apply) {
      console.log("\nDRY RUN ONLY — no permanent records changed.");
      console.log("Review results before using --apply.");
      return;
    }

    if (invalid.length) {
      throw new Error(
        "Repair stopped: some course/index records are missing."
      );
    }

    const backupFolder = path.resolve(
        __dirname,
        "../../../SmartStarsBackups"
    );

    fs.mkdirSync(backupFolder, { recursive: true });

    const [existingSlots] = await connection.query(
        `SELECT * FROM class_slots
        WHERE course_code IN (?)
        ORDER BY course_code, index_no, slot_id`,
        [TARGET_COURSES]
    );

    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const backupPath = path.join(
        backupFolder,
        `class_slots_before_restore_${timestamp}.json`
    );

    fs.writeFileSync(
        backupPath,
        JSON.stringify({
            database: database.database_name,
            courses: TARGET_COURSES,
            existingSlots
        }, null, 2),
        { flag: "wx" }
    );

    console.log("Backup saved:", backupPath);

    await connection.beginTransaction();

    try {
      const [result] = await connection.query(`
        INSERT INTO class_slots (
          course_code, index_no, class_type,
          class_group, day_of_week, start_time,
          end_time, venue, teaching_weeks
        )
        SELECT
          s.course_code, s.index_no, s.class_type,
          s.class_group, s.day_of_week, s.start_time,
          s.end_time, s.venue, s.teaching_weeks
        FROM repair_slots s
        WHERE s.course_code IN (?)
          AND ${isMissing}
      `, [TARGET_COURSES]);

      await connection.commit();

      console.log(
        "Restored sessions:", result.affectedRows
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.query(
      "DROP TEMPORARY TABLE IF EXISTS repair_slots"
    ).catch(() => {});

    connection.release();
  }
}

main()
  .catch(error => {
    console.error("Repair failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
