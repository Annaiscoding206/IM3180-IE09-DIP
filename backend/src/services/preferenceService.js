const pool = require("../config/db");
const { PlanningError } = require("./planningError");
const { validatePreferences, validateBlock } = require("./preferenceValidation");
const { invalidateRequestPlans } = require("./planInvalidationService");

function id(value, name) {
  if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new PlanningError(400, `${name} must be a positive INT`);
  }
  return Number(value);
}

async function withRequest(requestId, studentId, write, action) {
  const request = id(requestId, "requestId");
  if (typeof studentId !== "string" || !studentId.trim()) throw new PlanningError(401, "Student identity required");
  const db = await pool.getConnection();
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await db.beginTransaction();
    // Ownership is server-scoped, never taken from a body/query student_id.
    // Readers hold a shared parent lock for a coherent multi-table snapshot.
    const [rows] = await db.query(
      `SELECT request_id FROM planning_request WHERE request_id = ? AND student_id = ? ${write ? "FOR UPDATE" : "FOR SHARE"}`,
      [request, studentId]
    );
    if (!rows.length) throw new PlanningError(404, "Planning request not found for this student");
    const result = await action(db, request);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}

// Only this static mapping supplies SQL identifiers.
const sections = {
  day_preferences: { table: "planning_day_preference", fields: ["day_of_week", "preference_type", "constraint_level"] },
  time_preferences: { table: "planning_time_preference", fields: ["start_time", "end_time", "preference_type", "constraint_level"] },
  objectives: { table: "planning_objective", fields: ["objective_type", "priority"] },
};

async function readPreferences(db, requestId) {
  const result = { request_id: requestId };
  for (const [name, section] of Object.entries(sections)) {
    const [rows] = await db.query(`SELECT ${section.fields.join(", ")} FROM ${section.table} WHERE request_id = ? ORDER BY ${section.fields.join(", ")}`, [requestId]);
    result[name] = rows;
  }
  return result;
}

const signature = (rows) => JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());

function getPreferences(requestId, studentId) {
  return withRequest(requestId, studentId, false, readPreferences);
}

// Caller holds the owned planning_request lock. Used by HTTP replacement and
// Leo's atomic confirmation transaction; there is only one persistence rule.
async function replacePreferencesInTransaction(db, request, body) {
  const preferences = validatePreferences(body);
  const previous = await readPreferences(db, request);
  let changed = false;
  for (const [name, section] of Object.entries(sections)) {
    if (signature(previous[name]) === signature(preferences[name])) continue;
    changed = true;
    await db.query(`DELETE FROM ${section.table} WHERE request_id = ?`, [request]);
    for (const row of preferences[name]) {
      await db.query(`INSERT INTO ${section.table} (request_id, ${section.fields.join(", ")}) VALUES (${["?", ...section.fields.map(() => "?")].join(", ")})`,
        [request, ...section.fields.map((field) => row[field])]);
    }
  }
  if (changed) await invalidateRequestPlans(db, request);
  return { ...await readPreferences(db, request), changed };
}
function replacePreferences(requestId, studentId, body) {
  const preferences = validatePreferences(body);
  return withRequest(requestId, studentId, true, (db, request) => replacePreferencesInTransaction(db, request, preferences));
}

async function readBlocks(db, requestId) {
  const [rows] = await db.query(`SELECT block_id, request_id, day_of_week, start_time, end_time
    FROM planning_blocked_period WHERE request_id = ? ORDER BY day_of_week, start_time, end_time, block_id`, [requestId]);
  return { request_id: requestId, blocked_periods: rows };
}

function getBlocks(requestId, studentId) {
  return withRequest(requestId, studentId, false, readBlocks);
}

function addBlock(requestId, studentId, body) {
  const block = validateBlock(body);
  return withRequest(requestId, studentId, true, async (db, request) => {
    let result;
    try {
      [result] = await db.query(`INSERT INTO planning_blocked_period (request_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)`,
        [request, block.day_of_week, block.start_time, block.end_time]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw new PlanningError(409, "Blocked period already exists for this request");
      throw error;
    }
    // Mirror legacy request-level blocks to editable plans.
    await db.query(
      `INSERT IGNORE INTO plan_blocked_period
       (plan_id, day_of_week, start_time, end_time)
       SELECT plan_id, ?, ?, ?
       FROM plan
       WHERE request_id = ?
         AND status <> 'ARCHIVED'`,
      [
        block.day_of_week,
        block.start_time,
        block.end_time,
        request
      ]
    );

    await invalidateRequestPlans(db, request);

    return {
      block_id: result.insertId,
      request_id: request,
      ...block
    };
  });
}

function removeBlock(requestId, studentId, blockId) {
  const block = id(blockId, "blockId");

  return withRequest(
    requestId,
    studentId,
    true,
    async (db, request) => {
      // Find the request-level blocked period.
      const [rows] = await db.query(
        `SELECT day_of_week, start_time, end_time
         FROM planning_blocked_period
         WHERE request_id = ?
           AND block_id = ?`,
        [request, block]
      );

      if (!rows.length) {
        throw new PlanningError(
          404,
          "Blocked period not found for this request"
        );
      }

      const original = rows[0];

      // Mirror removal to non-archived plans.
      await db.query(
        `DELETE pb
         FROM plan_blocked_period pb
         JOIN plan p ON p.plan_id = pb.plan_id
         WHERE p.request_id = ?
           AND p.status <> 'ARCHIVED'
           AND pb.day_of_week = ?
           AND pb.start_time = ?
           AND pb.end_time = ?`,
        [
          request,
          original.day_of_week,
          original.start_time,
          original.end_time
        ]
      );

      await db.query(
        `DELETE FROM planning_blocked_period
         WHERE request_id = ?
           AND block_id = ?`,
        [request, block]
      );

      await invalidateRequestPlans(db, request);

      return {
        request_id: request,
        block_id: block
      };
    }
  );
}

function clearBlocks(requestId, studentId) {
  return withRequest(
    requestId,
    studentId,
    true,
    async (db, request) => {
      // Remove plan-level copies of request-level blocks.
      await db.query(
        `DELETE pb
         FROM plan_blocked_period pb
         JOIN plan p ON p.plan_id = pb.plan_id
         JOIN planning_blocked_period rb
           ON rb.request_id = p.request_id
           AND rb.day_of_week = pb.day_of_week
           AND rb.start_time = pb.start_time
           AND rb.end_time = pb.end_time
         WHERE p.request_id = ?
           AND p.status <> 'ARCHIVED'`,
        [request]
      );

      const [result] = await db.query(
        `DELETE FROM planning_blocked_period
         WHERE request_id = ?`,
        [request]
      );

      if (result.affectedRows) {
        await invalidateRequestPlans(db, request);
      }

      return {
        request_id: request,
        removed_count: result.affectedRows
      };
    }
  );
}

module.exports = { replacePreferencesInTransaction, getPreferences, replacePreferences, getBlocks, addBlock, removeBlock, clearBlocks, readPreferences, readBlocks };
