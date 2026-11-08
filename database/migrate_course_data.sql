-- ============================================================
-- Temporary migration:
-- Legacy courses database -> stars_companion_db
-- ============================================================

USE stars_companion_db;


-- ============================================================
-- 1. COURSE INFO
-- ============================================================
-- Legacy vacancy values were stored as 0 when vacancy was
-- unknown. The new schema distinguishes:
-- NULL = unknown
-- 0    = confirmed full.
-- Therefore legacy zero values are migrated as NULL.
-- ============================================================

INSERT INTO course_info (
    course_code,
    index_no,
    course_name,
    au,
    vacancy,
    vacancy_updated_at,
    prerequisite_text,
    restriction_text,
    mutually_exclusive_text,
    grading_type,
    exam_datetime,
    bde,
    gepe,
    academic_year,
    semester
)
SELECT
    course_code,
    index_no,
    course_name,
    au,

    CASE
        WHEN vacancy = 0 THEN NULL
        ELSE vacancy
    END AS vacancy,

    NULL AS vacancy_updated_at,

    prerequisite AS prerequisite_text,
    exemptions AS restriction_text,
    mutually_exclusive_with AS mutually_exclusive_text,

    grading_type,
    exam_datetime,
    bde,
    gepe,
    academic_year,
    semester

FROM courses.course_info;


-- ============================================================
-- 2. CLASS SLOTS
-- ============================================================

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
    course_code,
    index_no,
    class_type,
    class_group,
    day_of_week,
    start_time,
    end_time,
    venue,

    '1-13' AS teaching_weeks

FROM courses.class_slots;


-- ============================================================
-- 3. STRUCTURED COURSE REQUIREMENTS
-- ============================================================
-- These structured rows are used by the eligibility engine.
-- prerequisite_text remains in course_info for human-readable
-- display.
-- ============================================================


-- DA2002 requires DA1000
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('DA2002', 'DA1000', 'PREREQUISITE', 1);


-- DA3000 requires DA1000
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('DA3000', 'DA1000', 'PREREQUISITE', 1);


-- IE3014:
-- EE2010 OR IM2004 OR IE2010 OR IE2110
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('IE3014', 'EE2010', 'PREREQUISITE', 1),
('IE3014', 'IM2004', 'PREREQUISITE', 1),
('IE3014', 'IE2010', 'PREREQUISITE', 1),
('IE3014', 'IE2110', 'PREREQUISITE', 1);


-- MH1811 requires MH1810 as corequisite
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('MH1811', 'MH1810', 'COREQUISITE', 1);


-- IE4758:
-- IE1005 OR EE1005
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('IE4758', 'IE1005', 'PREREQUISITE', 1),
('IE4758', 'EE1005', 'PREREQUISITE', 1);


-- SC5002:
-- all courses below belong to the same OR group
INSERT INTO course_requirement (
    course_code,
    required_course_code,
    requirement_type,
    requirement_group
)
VALUES
('SC5002', 'SC1003', 'PREREQUISITE', 1),
('SC5002', 'SC5001', 'PREREQUISITE', 1),
('SC5002', 'CV1014', 'PREREQUISITE', 1),
('SC5002', 'BS1009', 'PREREQUISITE', 1),
('SC5002', 'MS1008', 'PREREQUISITE', 1),
('SC5002', 'MA1008', 'PREREQUISITE', 1),
('SC5002', 'PS0001', 'PREREQUISITE', 1),
('SC5002', 'IE2108', 'PREREQUISITE', 1),
('SC5002', 'RE1016', 'PREREQUISITE', 1),
('SC5002', 'CS4313', 'PREREQUISITE', 1);


-- ============================================================
-- 4. PROGRAMME RESTRICTIONS
-- ============================================================
--
-- For now we structure the restrictions needed for the
-- representative MVP/demo use cases.
--
-- Full original restriction text remains stored inside
-- course_info.restriction_text and can be structured further
-- later if needed.
-- ============================================================


-- DA courses unavailable to ADMC
INSERT INTO programme_restriction (
    course_code,
    programme,
    cohort,
    restriction_type
)
VALUES
('DA1000', 'ADMC', NULL, 'NOT_AVAILABLE'),
('DA2002', 'ADMC', NULL, 'NOT_AVAILABLE'),
('DA3000', 'ADMC', NULL, 'NOT_AVAILABLE');


-- SC5002: normalized IEM restriction for prototype eligibility
-- checking. The source text is preserved separately in
-- course_info.restriction_text.
INSERT INTO programme_restriction (
    course_code,
    programme,
    cohort,
    restriction_type
)
VALUES
('SC5002', 'IEM', NULL, 'NOT_AVAILABLE');


-- IE4758 direct-entry IEM cohort restriction
INSERT INTO programme_restriction (
    course_code,
    programme,
    cohort,
    restriction_type
)
VALUES
('IE4758', 'IEM', '2019-2021 Direct Entry', 'NOT_AVAILABLE');


-- ============================================================
-- 5. MUTUAL EXCLUSIONS
-- ============================================================


-- DA1000
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('DA1000', 'DA1100');


-- IE3014
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('IE3014', 'CE3007');


-- MH1810
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('MH1810', 'CE1011'),
('MH1810', 'CZ1011'),
('MH1810', 'MH1100'),
('MH1810', 'MH1101'),
('MH1810', 'MH1800'),
('MH1810', 'MH1801'),
('MH1810', 'MH2813');


-- MH1811
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('MH1811', 'MH1100'),
('MH1811', 'MH1101'),
('MH1811', 'MH1801'),
('MH1811', 'MS2900');


-- IE4758
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('IE4758', 'IM3003');


-- SC5002
INSERT INTO mutual_exclusion (
    course_code,
    excluded_course_code
)
VALUES
('SC5002', 'SC1315'),
('SC5002', 'SC3000'),
('SC5002', 'SC4000');