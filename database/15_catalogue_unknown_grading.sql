-- Additive catalogue extension: preserve unknown grading metadata as NULL.
-- Does not change any existing value or eligibility rule. Repeatable.
ALTER TABLE course_info
    MODIFY COLUMN grading_type ENUM('LETTER_GRADED', 'PASS_FAIL') NULL DEFAULT NULL;
