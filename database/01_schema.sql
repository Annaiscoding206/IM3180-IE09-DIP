-- ============================================================
-- Smart STARS Companion
-- Final Database Schema
-- IM3180 Design & Innovation Project
-- ============================================================

-- Optional local reset:
-- DROP DATABASE IF EXISTS stars_companion_db;

CREATE DATABASE IF NOT EXISTS stars_companion_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE stars_companion_db;


-- ============================================================
-- 1. COURSE INFORMATION
-- ============================================================
-- One row represents one course + index combination.
-- Existing structure is retained to avoid unnecessary migration.
-- ============================================================

CREATE TABLE course_info (
    course_code VARCHAR(10) NOT NULL,
    index_no INT NOT NULL,

    course_name VARCHAR(255) NOT NULL,
    au INT NOT NULL,

    -- NULL = vacancy information unavailable
    -- 0    = index is full
    vacancy INT NULL DEFAULT NULL,
    vacancy_updated_at DATETIME NULL,

    -- Original source text kept for display/reference.
    -- Structured eligibility rules are stored separately.
    prerequisite_text TEXT NULL,
    restriction_text TEXT NULL,
    mutually_exclusive_text TEXT NULL,

    grading_type ENUM(
        'LETTER_GRADED',
        'PASS_FAIL'
    ) NOT NULL,

    exam_datetime DATETIME NULL,

    bde BOOLEAN NOT NULL DEFAULT FALSE,
    gepe BOOLEAN NOT NULL DEFAULT FALSE,

    academic_year VARCHAR(20) NOT NULL,
    semester INT NOT NULL,

    PRIMARY KEY (course_code, index_no),

    CONSTRAINT chk_course_au
        CHECK (au > 0),

    CONSTRAINT chk_course_vacancy
        CHECK (vacancy IS NULL OR vacancy >= 0),

    CONSTRAINT chk_course_semester
        CHECK (semester BETWEEN 1 AND 3)
);


-- ============================================================
-- 1A. COURSE TYPES
-- ============================================================
-- A course can contribute to more than one curriculum bucket.
-- Kept separate from course_info because that table has one row per index.
-- ============================================================

CREATE TABLE course_type (
    course_code VARCHAR(10) NOT NULL,
    type_code ENUM('CORE', 'MPE', 'BDE') NOT NULL,

    PRIMARY KEY (course_code, type_code),
    INDEX idx_course_type_code (type_code)
);


-- ============================================================
-- 2. CLASS SLOTS
-- ============================================================

CREATE TABLE class_slots (
    slot_id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(10) NOT NULL,
    index_no INT NOT NULL,

    class_type ENUM(
        'LECTURE',
        'TUTORIAL',
        'LAB',
        'SEMINAR',
        'STUDIO'
    ) NOT NULL,

    class_group VARCHAR(20) NULL,

    day_of_week ENUM(
        'MON',
        'TUE',
        'WED',
        'THU',
        'FRI',
        'SAT',
        'SUN'
    ) NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    venue VARCHAR(100) NULL,

    -- Optional because some classes change venue/time
    -- depending on teaching week.
    teaching_weeks VARCHAR(50) NULL,

    CONSTRAINT fk_class_slots_course
        FOREIGN KEY (course_code, index_no)
        REFERENCES course_info(course_code, index_no)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_class_time
        CHECK (end_time > start_time),

    INDEX idx_class_schedule (
        day_of_week,
        start_time,
        end_time
    )
);


-- ============================================================
-- 3. STUDENT
-- ============================================================

CREATE TABLE student (
    student_id VARCHAR(15) NOT NULL,

    student_name VARCHAR(100) NULL,
    programme VARCHAR(50) NOT NULL,
    study_year INT NOT NULL,

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (student_id),

    CONSTRAINT chk_student_year
        CHECK (study_year BETWEEN 1 AND 6)
);


-- ============================================================
-- 4. COMPLETED COURSES
-- ============================================================
-- course_code intentionally has no FK to course_info.
--
-- Reason:
-- The prototype database contains only a subset of NTU courses,
-- but a student may have completed courses that are not stored
-- as full planner courses.
-- ============================================================

CREATE TABLE completed_course (
    student_id VARCHAR(15) NOT NULL,
    course_code VARCHAR(10) NOT NULL,

    PRIMARY KEY (student_id, course_code),

    CONSTRAINT fk_completed_course_student
        FOREIGN KEY (student_id)
        REFERENCES student(student_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    INDEX idx_completed_course_code (course_code)
);


-- ============================================================
-- 4A. AUTHORITATIVE ACADEMIC ATTEMPTS
-- ============================================================
-- completed_course above is retained as legacy history only.
-- Run 08_degree_audit.sql after legacy demo seed 03 to import those pairs.
-- Unknown historical metadata stays NULL; no course_info FK is intentional.

CREATE TABLE academic_record (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(15) NOT NULL,
    course_code VARCHAR(10) NOT NULL,
    course_title VARCHAR(255) NULL,
    academic_year VARCHAR(20) NULL,
    semester INT NULL,
    result ENUM('PASSED', 'FAILED', 'IN_PROGRESS') NOT NULL,
    grade VARCHAR(10) NULL,
    earned_au DECIMAL(6,2) NULL,
    source ENUM('LEGACY_COMPLETED', 'DEMO') NOT NULL,
    source_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_academic_record_student FOREIGN KEY (student_id)
        REFERENCES student(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_academic_record_semester CHECK (semester IS NULL OR semester BETWEEN 1 AND 3),
    CONSTRAINT chk_academic_record_au CHECK (earned_au IS NULL OR earned_au >= 0),
    CONSTRAINT chk_academic_record_nonpass_au CHECK (result = 'PASSED' OR (earned_au IS NOT NULL AND earned_au = 0)),
    UNIQUE KEY uq_academic_record_source (student_id, source_key),
    INDEX idx_academic_record_course (student_id, course_code, result)
);


-- ============================================================
-- 5. COURSE REQUIREMENTS
-- ============================================================
-- Stores prerequisite/corequisite rules in structured form.
--
-- requirement_group supports logical grouping.
--
-- Example:
-- SC1003 OR SC5001 OR CV1014
-- can all belong to requirement_group = 1.
--
-- (A OR B) AND C:
-- A, B -> group 1
-- C    -> group 2
-- ============================================================

CREATE TABLE course_requirement (
    requirement_id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(10) NOT NULL,
    required_course_code VARCHAR(10) NOT NULL,

    requirement_type ENUM(
        'PREREQUISITE',
        'COREQUISITE'
    ) NOT NULL,

    requirement_group INT NOT NULL DEFAULT 1,

    CONSTRAINT chk_requirement_group
        CHECK (requirement_group >= 1),

    UNIQUE KEY uq_course_requirement (
        course_code,
        required_course_code,
        requirement_type,
        requirement_group
    ),

    INDEX idx_requirement_course (course_code)
);


-- ============================================================
-- 6. PROGRAMME RESTRICTIONS
-- ============================================================

CREATE TABLE programme_restriction (
    restriction_id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(10) NOT NULL,

    programme VARCHAR(50) NOT NULL,

    -- NULL = not cohort-specific
    cohort VARCHAR(50) NULL,

    restriction_type ENUM(
        'NOT_AVAILABLE',
        'ONLY_AVAILABLE'
    ) NOT NULL DEFAULT 'NOT_AVAILABLE',

    INDEX idx_programme_restriction (
        course_code,
        programme
    )
);


-- ============================================================
-- 7. MUTUAL EXCLUSION
-- ============================================================

CREATE TABLE mutual_exclusion (
    exclusion_id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(10) NOT NULL,
    excluded_course_code VARCHAR(10) NOT NULL,

    UNIQUE KEY uq_mutual_exclusion (
        course_code,
        excluded_course_code
    ),

    INDEX idx_mutual_exclusion_course (course_code)
);


-- ============================================================
-- 8. PLANNING REQUEST
-- ============================================================
-- Represents one semester-planning session BEFORE
-- Plan A / B / C are generated.
--
-- Preferences are stored in separate generic tables.
-- ============================================================

CREATE TABLE planning_request (
    request_id INT AUTO_INCREMENT PRIMARY KEY,

    student_id VARCHAR(15) NOT NULL,

    academic_year VARCHAR(20) NOT NULL,
    semester INT NOT NULL,

    target_au INT NULL,

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_planning_request_student
        FOREIGN KEY (student_id)
        REFERENCES student(student_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_request_semester
        CHECK (semester BETWEEN 1 AND 3),

    CONSTRAINT chk_target_au
        CHECK (target_au IS NULL OR target_au > 0),

    INDEX idx_planning_request_student (student_id)
);


-- ============================================================
-- 9. COURSES SELECTED FOR PLANNING
-- ============================================================
-- Student selects course codes first.
-- The timetable generator chooses indexes later.
--
-- course_code intentionally has no FK to course_info because
-- course_info uses (course_code, index_no) as its composite key.
-- ============================================================

CREATE TABLE planning_request_course (
    request_id INT NOT NULL,
    course_code VARCHAR(10) NOT NULL,

    PRIMARY KEY (
        request_id,
        course_code
    ),

    CONSTRAINT fk_request_course_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    INDEX idx_request_course_code (course_code)
);


-- ============================================================
-- 10. DAY PREFERENCES
-- ============================================================
-- Generic structure for preferred / avoided days.
--
-- Examples:
-- Friday -> AVOID -> HARD
-- Monday -> PREFER -> SOFT
-- Wednesday -> AVOID -> SOFT
-- ============================================================

CREATE TABLE planning_day_preference (
    day_preference_id INT AUTO_INCREMENT PRIMARY KEY,

    request_id INT NOT NULL,

    day_of_week ENUM(
        'MON',
        'TUE',
        'WED',
        'THU',
        'FRI',
        'SAT',
        'SUN'
    ) NOT NULL,

    preference_type ENUM(
        'PREFER',
        'AVOID'
    ) NOT NULL,

    constraint_level ENUM(
        'HARD',
        'SOFT'
    ) NOT NULL DEFAULT 'SOFT',

    CONSTRAINT fk_day_preference_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    UNIQUE KEY uq_day_preference (
        request_id,
        day_of_week,
        preference_type
    ),

    INDEX idx_day_preference_request (request_id)
);


-- ============================================================
-- 11. TIME PREFERENCES
-- ============================================================
-- Generic time-range preference.
--
-- Examples:
-- 08:30-12:00 -> AVOID  -> SOFT
-- 08:00-10:00 -> AVOID  -> HARD
-- 12:00-18:00 -> PREFER -> SOFT
-- ============================================================

CREATE TABLE planning_time_preference (
    time_preference_id INT AUTO_INCREMENT PRIMARY KEY,

    request_id INT NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    preference_type ENUM(
        'PREFER',
        'AVOID'
    ) NOT NULL,

    constraint_level ENUM(
        'HARD',
        'SOFT'
    ) NOT NULL DEFAULT 'SOFT',

    CONSTRAINT fk_time_preference_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_preference_time
        CHECK (end_time > start_time),

    UNIQUE KEY uq_time_preference (
        request_id,
        start_time,
        end_time,
        preference_type
    ),

    INDEX idx_time_preference_request (request_id)
);


-- ============================================================
-- 12. PLANNING OBJECTIVES
-- ============================================================
-- Stores optimization goals separately from day/time preferences.
--
-- Examples:
-- MINIMIZE_GAPS
-- MINIMIZE_SCHOOL_DAYS
--
-- objective_type is VARCHAR instead of ENUM so that additional
-- objectives can be added later without changing the DB schema.
--
-- Lower priority number = higher importance.
-- ============================================================

CREATE TABLE planning_objective (
    objective_id INT AUTO_INCREMENT PRIMARY KEY,

    request_id INT NOT NULL,

    objective_type VARCHAR(50) NOT NULL,

    priority INT NOT NULL DEFAULT 1,

    CONSTRAINT fk_planning_objective_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_objective_priority
        CHECK (priority >= 1),

    UNIQUE KEY uq_planning_objective (
        request_id,
        objective_type
    ),

    INDEX idx_planning_objective_request (request_id)
);


-- ============================================================
-- 12A. DAY-SPECIFIC BLOCKED PERIODS
-- ============================================================
-- Hard unavailability, separate from global planning_time_preference.

CREATE TABLE planning_blocked_period (
    block_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    day_of_week ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    CONSTRAINT fk_blocked_period_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_blocked_period_time CHECK (end_time > start_time),
    UNIQUE KEY uq_blocked_period (request_id, day_of_week, start_time, end_time)
);


-- ============================================================
-- 13. GENERATED TIMETABLE PLAN
-- ============================================================
-- A planning request may generate:
-- Plan A
-- Plan B
-- Plan C
-- ============================================================

CREATE TABLE plan (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,

    request_id INT NOT NULL,

    plan_name VARCHAR(50) NOT NULL,

    -- 1 = highest-ranked generated result
    rank_no INT NULL,

    -- Preference match score between 0 and 100
    match_score DECIMAL(5,2) NULL,

    status ENUM(
        'GENERATED',
        'SELECTED',
        'ARCHIVED'
    ) NOT NULL DEFAULT 'GENERATED',

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_plan_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_plan_rank
        CHECK (
            rank_no IS NULL
            OR rank_no >= 1
        ),

    CONSTRAINT chk_match_score
        CHECK (
            match_score IS NULL
            OR match_score BETWEEN 0 AND 100
        ),

    UNIQUE KEY uq_request_plan_name (
        request_id,
        plan_name
    ),

    INDEX idx_plan_request (request_id)
);


-- ============================================================
-- 14. COURSES / INDEXES INSIDE A GENERATED PLAN
-- ============================================================
-- Example:
--
-- Plan A
-- IE3014 -> 32423
-- IE3102 -> 32442
-- MH1811 -> 50005
--
-- Weekday/time are NOT duplicated here because they already
-- exist in class_slots.
-- ============================================================

CREATE TABLE plan_course (
    plan_course_id INT AUTO_INCREMENT PRIMARY KEY,

    plan_id INT NOT NULL,

    course_code VARCHAR(10) NOT NULL,
    index_no INT NOT NULL,

    -- Supports "lock this index and regenerate the rest".
    locked BOOLEAN NOT NULL DEFAULT FALSE,

    added_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_plan_course_plan
        FOREIGN KEY (plan_id)
        REFERENCES plan(plan_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_plan_course_index
        FOREIGN KEY (course_code, index_no)
        REFERENCES course_info(course_code, index_no)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Prevent the same course appearing twice in one plan.
    UNIQUE KEY uq_plan_course (
        plan_id,
        course_code
    ),

    INDEX idx_plan_course_index (
        course_code,
        index_no
    )
);
