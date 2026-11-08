// Caller must already hold the planning_request row lock. Keep request-before-plan
// ordering, and invalidate metadata without deleting any plan or chosen indexes.
async function invalidateRequestPlans(db, requestId) {
  await db.query(
    `UPDATE plan SET rank_no = NULL, match_score = NULL,
       status = CASE WHEN status = 'SELECTED' THEN 'GENERATED' ELSE status END,
       updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status <> 'ARCHIVED'`,
    [requestId]
  );
  await db.query("UPDATE planning_request SET updated_at = CURRENT_TIMESTAMP WHERE request_id = ?", [requestId]);
}

async function invalidatePlan(db, planId) {
  await db.query(`UPDATE plan SET rank_no = NULL, match_score = NULL,
    status = CASE WHEN status = 'SELECTED' THEN 'GENERATED' ELSE status END,
    updated_at = CURRENT_TIMESTAMP WHERE plan_id = ? AND status <> 'ARCHIVED'`, [planId]);
}
module.exports = { invalidateRequestPlans, invalidatePlan };
