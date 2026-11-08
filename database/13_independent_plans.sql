
-- ============================================================
-- Independent Plan Courses and Blocked Periods
-- Migration 13
--
-- Additive migration: preserves existing tables and records.
-- Historical backfilling will be handled separately.
-- ============================================================

-- 1. Courses selected for each individual plan.
--
-- Unlike plan_course, an index is NOT required here.
-- A student can select a course before choosing its index.

CREATE TABLE IF NOT EXISTS plan_selected_course (
    plan_id INT NOT NULL,
    course_code VARCHAR(10) NOT NULL,

    PRIMARY KEY (plan_id, course_code),

    CONSTRAINT fk_plan_selected_course_plan
        FOREIGN KEY (plan_id)
        REFERENCES plan(plan_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    INDEX idx_plan_selected_course_code (course_code)
);


-- 2. Blocked periods belonging to individual plans.
--
-- The existing planning_blocked_period table remains
-- unchanged during this migration.

CREATE TABLE IF NOT EXISTS plan_blocked_period (
    block_id INT AUTO_INCREMENT PRIMARY KEY,

    plan_id INT NOT NULL,

    day_of_week ENUM(
        'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
    ) NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    CONSTRAINT fk_plan_blocked_period_plan
        FOREIGN KEY (plan_id)
        REFERENCES plan(plan_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_plan_blocked_period_time
        CHECK (end_time > start_time),

    UNIQUE KEY uq_plan_blocked_period (
        plan_id,
        day_of_week,
        start_time,
        end_time
    )
);
