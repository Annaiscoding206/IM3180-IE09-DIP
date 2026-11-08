const plans = require("./planService");
const { checkClashes } = require("./clashService");
const { readPreferenceSnapshot, checkHardConstraints } = require("./hardConstraintService");
const { searchTimetables, SEARCH_LIMITS } = require("./timetableSearchService");
const { rankPlans } = require("./planRankingService");
const { explainGeneration } = require("./planningExplanationService");

const AUTO_NAME = /^AUTO Plan [ABC] #(\d+)$/;

async function findAlternatives({
  db,
  request,
  selected,
  sourcePlanId,
  locks,
  limit,
}) {
  const selectedCodes = selected.map((row) => row.course_code);
  const snapshot = await readPreferenceSnapshot(
    db,
    request.request_id,
    sourcePlanId
  );
  const reasons = [];
  const emptySearch = {
    visited_nodes: 0,
    candidates_found: 0,
    exhaustive: true,
    ...SEARCH_LIMITS,
  };

  function noPlan(details, search = emptySearch) {
    const limited = !search.exhaustive;
    throw new plans.PlanningError(
      limited ? 409 : 422,
      limited
        ? "Search limit reached without a plan; infeasibility is not proven"
        : "No feasible timetable satisfies the selected courses and constraints",
      {
        code: limited ? "SEARCH_LIMIT_REACHED" : "NO_FEASIBLE_PLAN",
        request_id: request.request_id,
        source_plan_id: sourcePlanId,
        plans: [],
        ...explainGeneration(details, search),
        search,
      }
    );
  }

  if (!selected.length) {
    noPlan([{ code: "NO_SELECTED_COURSES" }]);
  }

  for (const [code, index] of locks) {
    if (!selected.some((row) => row.course_code === code)) {
      reasons.push({
        code: "LOCKED_COURSE_NOT_SELECTED",
        course_code: code,
        index_no: index,
      });
    }
  }

  const academics = await plans.evaluatePlanAcademics(
    request,
    selected,
    db,
    selectedCodes
  );
  if (!academics.eligible) {
    reasons.push({ code: "ACADEMIC_INELIGIBILITY", eligibility: academics });
  }
  if (reasons.length) noPlan(reasons);

  const domains = [];
  const rejectedIndexes = [];
  for (const { course_code } of selected) {
    const [available] = await db.query(
      `SELECT course_code, index_no FROM course_info
       WHERE course_code = ? AND academic_year = ? AND semester = ?
       ORDER BY index_no`,
      [course_code, request.academic_year, request.semester]
    );
    const locked = locks.has(course_code);
    const eligibleIndexes = locked
      ? available.filter((index) => index.index_no === locks.get(course_code))
      : available;
    const domain = { course_code, locked, indexes: [] };
    const rejected = [];

    for (const index of await plans.readSchedules(eligibleIndexes, db)) {
      const timetable = checkClashes([index]);
      const constraints = checkHardConstraints([index], snapshot);
      if (timetable.can_save && constraints.valid) {
        domain.indexes.push({ ...index, locked });
      } else {
        rejected.push({
          course_code,
          index_no: index.index_no,
          timetable,
          constraints,
        });
      }
    }

    rejectedIndexes.push(...rejected);
    if (!domain.indexes.length) {
      reasons.push({
        code: locked ? "LOCKED_INDEX_INVALID" : "NO_VALID_INDEX",
        course_code,
        ...(locked ? { index_no: locks.get(course_code) } : {}),
        term_index_count: available.length,
        rejected_indexes: rejected,
        message: eligibleIndexes.length
          ? "Indexes fail timetable data or hard constraints"
          : "No matching course/index in the request term",
      });
    }
    domains.push(domain);
  }

  if (reasons.length) noPlan(reasons);

  const { candidates, search } = searchTimetables(domains);
  if (!candidates.length) {
    noPlan(
      [
        {
          code: locks.size
            ? "LOCKED_COMBINATION_INFEASIBLE"
            : "NO_CLASH_FREE_COMBINATION",
          locked_indexes: [...locks].map(([course_code, index_no]) => ({
            course_code,
            index_no,
          })),
        },
      ],
      search
    );
  }

  const alternatives = rankPlans(candidates, snapshot).slice(0, limit);
  for (const alternative of alternatives) {
    alternative.validation = await plans.validatePlanContents(
      request,
      alternative.indexes,
      db,
      { selectedCourseCodes: selectedCodes, snapshot }
    );

    if (!alternative.validation.can_finalize) {
      noPlan(
        [
          {
            code: "FINAL_VALIDATION_FAILED",
            validation: alternative.validation,
          },
        ],
        search
      );
    }
  }

  return {
    alternatives,
    rejectedIndexes,
    search,
    selectedCodes,
    snapshot,
  };
}

async function generatePlans(requestId, studentId, body = {}) {
  const id = plans.integer(requestId, "requestId");
  if (typeof studentId !== "string" || !studentId.trim()) throw new plans.PlanningError(401, "Student identity required");
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "source_plan_id")) {
    throw new plans.PlanningError(400, "Only optional source_plan_id is accepted");
  }
  const sourceId = Object.hasOwn(body, "source_plan_id") ? plans.integer(body.source_plan_id, "source_plan_id") : null;
  return plans.transaction(async db => {
    const [requests] = await db.query("SELECT * FROM planning_request WHERE request_id = ? AND student_id = ? FOR UPDATE", [id, studentId]);
    if (!requests.length) throw new plans.PlanningError(404, "Planning request not found for this student");
    const request = requests[0];
    // Never lock a plan before its parent. Serialize with preference, selection,
    // index and final-selection writes for this request throughout generation.
    const [existing] = await db.query("SELECT * FROM plan WHERE request_id = ? ORDER BY plan_id FOR UPDATE", [id]);
    if (sourceId !== null && !existing.some(plan => plan.plan_id === sourceId)) {
      throw new plans.PlanningError(404, "Source plan not found in this planning request");
    }
    const [allLocks] = await db.query(`SELECT pc.plan_id, pc.course_code, pc.index_no FROM plan_course pc
      JOIN plan p ON p.plan_id = pc.plan_id WHERE p.request_id = ? AND pc.locked = TRUE ORDER BY pc.plan_id, pc.course_code`, [id]);
    if (sourceId === null && allLocks.length) throw new plans.PlanningError(409, "Specify source_plan_id to choose which plan's locks to preserve", {
      code: "SOURCE_PLAN_REQUIRED", locked_plan_ids: [...new Set(allLocks.map(row => row.plan_id))],
    });
    const locks = new Map(allLocks.filter(row => row.plan_id === sourceId).map(row => [row.course_code, row.index_no]));
    let selected;

    if (sourceId !== null) {
      // Generate using the selected courses of a specific plan.
      [selected] = await db.query(
        `SELECT course_code
         FROM plan_selected_course
         WHERE plan_id = ?
         ORDER BY course_code`,
        [sourceId]
      );
    } else {
      // Legacy fallback when no source plan is specified.
      [selected] = await db.query(
        `SELECT course_code
         FROM planning_request_course
         WHERE request_id = ?
         ORDER BY course_code`,
        [id]
      );
    }

    const {
      alternatives,
      rejectedIndexes,
      search,
      selectedCodes,
      snapshot,
    } = await findAlternatives({
      db,
      request,
      selected,
      sourcePlanId: sourceId,
      locks,
      limit: 3,
    });
    // Names provide provenance without a schema change. The manual create API
    // reserves this prefix. Never delete plans; preserve source, SELECTED and
    // ARCHIVED rows, including their indexes/status/metadata. Only old AUTO
    // GENERATED drafts are retired, in the same transaction as new inserts.
    const batch = Math.max(0, ...existing.map(plan => Number(plan.plan_name.match(AUTO_NAME)?.[1] || 0))) + 1;
    const retired = existing.filter(plan => AUTO_NAME.test(plan.plan_name) && plan.status === "GENERATED" && plan.plan_id !== sourceId);
    for (const plan of retired) await db.query("UPDATE plan SET status = 'ARCHIVED', rank_no = NULL, match_score = NULL, updated_at = CURRENT_TIMESTAMP WHERE plan_id = ?", [plan.plan_id]);
    const results = [];
    for (const [position, alternative] of alternatives.entries()) {
      const label = `Plan ${"ABC"[position]}`;
      const name = `AUTO ${label} #${batch}`;
      const [inserted] = await db.query(
        `INSERT INTO plan
         (request_id, plan_name, rank_no, match_score, status)
         VALUES (?, ?, ?, ?, 'GENERATED')`,
        [id, name, position + 1, alternative.metrics.match_score]
      );

      const newPlanId = inserted.insertId;

      // 1. Save this plan's selected courses.
      for (const courseCode of selectedCodes) {
        await db.query(
          `INSERT INTO plan_selected_course
           (plan_id, course_code)
           VALUES (?, ?)`,
          [newPlanId, courseCode]
        );
      }

      // 2. Save this plan's blocked periods.
      for (const block of snapshot.blocked_periods) {
        await db.query(
          `INSERT INTO plan_blocked_period
           (plan_id, day_of_week, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [
            newPlanId,
            block.day_of_week,
            block.start_time,
            block.end_time
          ]
        );
      }

      // 3. Save the generated course indexes.
      for (const index of alternative.indexes) {
        await db.query(
          `INSERT INTO plan_course
           (plan_id, course_code, index_no, locked)
           VALUES (?, ?, ?, ?)`,
          [
            newPlanId,
            index.course_code,
            index.index_no,
            index.locked
          ]
        );
      }
      const validation = alternative.validation;
      results.push({ plan_id: inserted.insertId, plan_name: name, label, rank_no: position + 1,
        match_score: alternative.metrics.match_score, status: "GENERATED", metrics: alternative.metrics,
        indexes: alternative.indexes.map(({ course_code, index_no, locked }) => ({ course_code, index_no, locked })),
        validation: { ...validation, plan_id: inserted.insertId,
          eligibility: { ...validation.eligibility, plan_id: inserted.insertId },
          timetable: { ...validation.timetable, plan_id: inserted.insertId } },
      });
    }
    return { request_id: id, source_plan_id: sourceId, plans: results, search,
      ranking_scope: search.exhaustive ? "all_feasible_combinations" : "bounded_candidate_pool",
      retired_plan_ids: retired.map(plan => plan.plan_id), rejected_indexes: rejectedIndexes };
  });
}

async function regeneratePlan(planId, studentId) {
  const id = plans.integer(planId, "planId");
  if (typeof studentId !== "string" || !studentId.trim()) {
    throw new plans.PlanningError(401, "Student identity required");
  }

  return plans.transaction(async (db) => {
    const plan = await plans.getPlan(id, db, true);
    if (plan.student_id !== studentId) {
      throw new plans.PlanningError(404, "Plan not found for this student");
    }
    if (plan.status === "ARCHIVED") {
      throw new plans.PlanningError(409, "Archived plans cannot be regenerated");
    }

    const [selected] = await db.query(
      `SELECT course_code
       FROM plan_selected_course
       WHERE plan_id = ?
       ORDER BY course_code`,
      [plan.plan_id]
    );
    const [currentIndexes] = await db.query(
      `SELECT course_code, index_no, locked
       FROM plan_course
       WHERE plan_id = ?
       ORDER BY course_code`,
      [plan.plan_id]
    );
    const locks = new Map(
      currentIndexes
        .filter((row) => Boolean(row.locked))
        .map((row) => [row.course_code, row.index_no])
    );

    const {
      alternatives,
      rejectedIndexes,
      search,
    } = await findAlternatives({
      db,
      request: plan,
      selected,
      sourcePlanId: plan.plan_id,
      locks,
      // Keep enough ranked candidates to avoid returning the exact same
      // arrangement when another feasible arrangement exists.
      limit: 3,
    });
    const arrangementKey = (indexes) => indexes
      .map(({ course_code, index_no }) => `${course_code}/${index_no}`)
      .sort()
      .join(",");
    const currentKey = arrangementKey(currentIndexes);
    const alternative = alternatives.find(
      (candidate) => arrangementKey(candidate.indexes) !== currentKey
    ) || alternatives[0];

    // Blocks and locked rows belong to this plan and remain untouched. Only
    // unlocked index assignments are replaced after a complete candidate has
    // passed every validation check, so a failed regeneration rolls back with
    // the original timetable intact.
    await db.query(
      "DELETE FROM plan_course WHERE plan_id = ? AND locked = FALSE",
      [plan.plan_id]
    );

    for (const index of alternative.indexes.filter((row) => !row.locked)) {
      await db.query(
        `INSERT INTO plan_course
         (plan_id, course_code, index_no, locked)
         VALUES (?, ?, ?, FALSE)`,
        [plan.plan_id, index.course_code, index.index_no]
      );
    }

    await db.query(
      `UPDATE plan
       SET rank_no = 1,
           match_score = ?,
           status = 'GENERATED',
           updated_at = CURRENT_TIMESTAMP
       WHERE plan_id = ?`,
      [alternative.metrics.match_score, plan.plan_id]
    );

    return {
      plan_id: plan.plan_id,
      request_id: plan.request_id,
      plan_name: plan.plan_name,
      status: "GENERATED",
      rank_no: 1,
      match_score: alternative.metrics.match_score,
      metrics: alternative.metrics,
      indexes: alternative.indexes.map(
        ({ course_code, index_no, locked }) => ({
          course_code,
          index_no,
          locked,
        })
      ),
      validation: alternative.validation,
      search,
      rejected_indexes: rejectedIndexes,
    };
  });
}

module.exports = { generatePlans, regeneratePlan };
