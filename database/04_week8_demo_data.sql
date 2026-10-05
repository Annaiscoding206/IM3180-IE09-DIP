-- Smart STARS Companion: optional Week 8 demo fixtures
-- Run after the schema and course catalogue are loaded.
-- These are synthetic test sessions, not official NTU schedules.
-- Existing student records and timetable sessions are preserved.

USE stars_companion_db;

START TRANSACTION;

-- Student with no completed courses on first creation.
-- Allows testing MH1811's dependency on concurrent MH1810 selection.
INSERT INTO student (
    student_id,
    student_name,
    programme,
    study_year
)
SELECT
    'TEST_COREQ_W7',
    'Corequisite Demo Student',
    'IEM',
    3
WHERE NOT EXISTS (
    SELECT 1
    FROM student
    WHERE student_id = 'TEST_COREQ_W7'
);

-- Add synthetic sessions only when this course/index exists
-- and currently has no sessions.
SET @add_mh1811_demo_slots = (
    EXISTS (
        SELECT 1
        FROM course_info
        WHERE course_code = 'MH1811'
          AND index_no = 50001
    )
    AND NOT EXISTS (
        SELECT 1
        FROM class_slots
        WHERE course_code = 'MH1811'
          AND index_no = 50001
    )
);

INSERT INTO class_slots (
    course_code,
    index_no,
    class_type,
    class_group,
    day_of_week,
    start_time,
    end_time,
    venue,
    teaching_weeks
)
SELECT
    'MH1811',
    50001,
    'LECTURE',
    'TEST',
    'FRI',
    '08:30:00',
    '10:20:00',
    'DEMO-LT',
    NULL
WHERE @add_mh1811_demo_slots = 1;

INSERT INTO class_slots (
    course_code,
    index_no,
    class_type,
    class_group,
    day_of_week,
    start_time,
    end_time,
    venue,
    teaching_weeks
)
SELECT
    'MH1811',
    50001,
    'TUTORIAL',
    'TEST',
    'MON',
    '12:30:00',
    '13:20:00',
    'DEMO-TR',
    NULL
WHERE @add_mh1811_demo_slots = 1;

COMMIT;

-- Verify the resulting records.
SELECT student_id, programme, study_year
FROM student
WHERE student_id = 'TEST_COREQ_W7';

SELECT
    course_code,
    index_no,
    class_type,
    class_group,
    day_of_week,
    start_time,
    end_time,
    venue
FROM class_slots
WHERE course_code = 'MH1811'
  AND index_no = 50001
ORDER BY day_of_week, start_time;