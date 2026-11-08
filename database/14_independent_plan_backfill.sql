-- ============================================================
-- Migration 14: Copy existing selections and blocks into plans
-- Run ONCE, after 13_independent_plans.sql
-- ============================================================

-- Keep a record of completed data migrations.
-- DDL must be outside the transaction.

CREATE TABLE IF NOT EXISTS data_migration_log (
    migration_key VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

START TRANSACTION;

-- This unique record prevents accidental reruns.
-- If already present, the migration fails without recopying data.

INSERT INTO data_migration_log (migration_key)
VALUES ('14_independent_plans_initial_copy');


-- 1. Copy currently selected courses to every existing plan.

INSERT INTO plan_selected_course (
    plan_id,
    course_code
)
SELECT
    p.plan_id,
    rc.course_code
FROM plan p
JOIN planning_request_course rc
    ON rc.request_id = p.request_id;


-- 2. Copy existing blocked periods to every existing plan.

INSERT INTO plan_blocked_period (
    plan_id,
    day_of_week,
    start_time,
    end_time
)
SELECT
    p.plan_id,
    bp.day_of_week,
    bp.start_time,
    bp.end_time
FROM plan p
JOIN planning_blocked_period bp
    ON bp.request_id = p.request_id;


COMMIT;


-- 3. Verification summary.

SELECT
    (SELECT COUNT(*) FROM plan)
        AS total_plans,

    (SELECT COUNT(*) FROM plan_selected_course)
        AS plan_selected_course_rows,

    (SELECT COUNT(*) FROM plan_blocked_period)
        AS plan_blocked_period_rows,

    (SELECT COUNT(*)
     FROM plan p
     JOIN planning_request_course rc
         ON rc.request_id = p.request_id
     LEFT JOIN plan_selected_course sc
         ON sc.plan_id = p.plan_id
         AND sc.course_code = rc.course_code
     WHERE sc.plan_id IS NULL)
        AS missing_course_mappings,

    (SELECT COUNT(*)
     FROM plan p
     JOIN planning_blocked_period bp
         ON bp.request_id = p.request_id
     LEFT JOIN plan_blocked_period pb
         ON pb.plan_id = p.plan_id
         AND pb.day_of_week = bp.day_of_week
         AND pb.start_time = bp.start_time
         AND pb.end_time = bp.end_time
     WHERE pb.block_id IS NULL)
        AS missing_block_mappings;