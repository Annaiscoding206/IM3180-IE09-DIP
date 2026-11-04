-- ============================================================
-- Smart STARS Companion
-- Demo / Test Data
-- IM3180 Design & Innovation Project
-- ============================================================

USE stars_companion_db;


-- ============================================================
-- 1. DEMO STUDENT
-- ============================================================

INSERT INTO student (
    student_id,
    student_name,
    programme,
    study_year
)
VALUES (
    'DEMO001',
    'Demo Student',
    'IEM',
    3
);


-- ============================================================
-- 2. COMPLETED COURSES
-- ============================================================

INSERT INTO completed_course (
    student_id,
    course_code
)
VALUES
('DEMO001', 'MH1810'),
('DEMO001', 'IE2110'),
('DEMO001', 'IE2108');


-- ============================================================
-- 3. PLANNING REQUEST
-- ============================================================

INSERT INTO planning_request (
    student_id,
    academic_year,
    semester,
    target_au
)
VALUES (
    'DEMO001',
    '2026-2027',
    1,
    9
);

SET @demo_request_id = LAST_INSERT_ID();


-- ============================================================
-- 4. COURSES SELECTED FOR PLANNING
-- ============================================================

INSERT INTO planning_request_course (
    request_id,
    course_code
)
VALUES
(@demo_request_id, 'IE3014'),
(@demo_request_id, 'IE3102'),
(@demo_request_id, 'CS2024');


-- ============================================================
-- 5. DAY PREFERENCE
-- ============================================================

INSERT INTO planning_day_preference (
    request_id,
    day_of_week,
    preference_type,
    constraint_level
)
VALUES (
    @demo_request_id,
    'FRI',
    'AVOID',
    'HARD'
);


-- ============================================================
-- 6. TIME PREFERENCES
-- ============================================================

INSERT INTO planning_time_preference (
    request_id,
    start_time,
    end_time,
    preference_type,
    constraint_level
)
VALUES
(
    @demo_request_id,
    '08:00:00',
    '12:00:00',
    'AVOID',
    'SOFT'
),
(
    @demo_request_id,
    '12:00:00',
    '18:00:00',
    'PREFER',
    'SOFT'
);


-- ============================================================
-- 7. PLANNING OBJECTIVES
-- ============================================================

INSERT INTO planning_objective (
    request_id,
    objective_type,
    priority
)
VALUES
(
    @demo_request_id,
    'MINIMIZE_SCHOOL_DAYS',
    1
),
(
    @demo_request_id,
    'MINIMIZE_GAPS',
    2
);
-- ============================================================
-- 8. DEMO CLASS SLOTS
-- ============================================================

INSERT INTO class_slots (
    course_code,
    index_no,
    class_type,
    day_of_week,
    start_time,
    end_time,
    venue,
    teaching_weeks
)

VALUES

(
    'MH1810',
    15091,
    'LECTURE',
    'MON',
    '08:30:00', 
    '10:30:00',
    'LT1',
    '1-13'
),

(
    'MH1810',
    15091,
    'TUTORIAL',
    'WED',
    '10:30:00',
    '11:30:00',
    'TR1',
    '1-13'
),

(
    'IE3014',
    32423,
    'LECTURE',
    'TUE',
    '12:30:00',
    '14:30:00',
    'LT2',
    '1-13'
);