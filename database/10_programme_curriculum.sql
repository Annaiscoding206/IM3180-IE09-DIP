-- Repeatable extension only. Never derives admission year from study year.
USE stars_companion_db;
SET @curriculum_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'student' AND column_name = 'admission_year') = 0,
    'ALTER TABLE student ADD COLUMN admission_year INT NULL, ADD CONSTRAINT chk_student_admission_year CHECK (admission_year IS NULL OR admission_year BETWEEN 1900 AND 2200)', 'SELECT 1');
PREPARE curriculum_stmt FROM @curriculum_ddl;
EXECUTE curriculum_stmt;
DEALLOCATE PREPARE curriculum_stmt;
SET @curriculum_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'student' AND column_name = 'admission_route') = 0,
    'ALTER TABLE student ADD COLUMN admission_route VARCHAR(50) NULL', 'SELECT 1');
PREPARE curriculum_stmt FROM @curriculum_ddl;
EXECUTE curriculum_stmt;
DEALLOCATE PREPARE curriculum_stmt;

-- Synthetic/demo curricula. A route NULL means explicitly route-independent.
CREATE TABLE IF NOT EXISTS programme_curriculum (
    curriculum_id INT AUTO_INCREMENT PRIMARY KEY,
    curriculum_key VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    programme VARCHAR(50) NOT NULL,
    admission_year INT NOT NULL,
    admission_route VARCHAR(50) NULL,
    is_demo BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT NOT NULL,
    CONSTRAINT chk_curriculum_cohort CHECK (admission_year BETWEEN 1900 AND 2200),
    INDEX idx_curriculum_match (programme, admission_year, admission_route)
);

CREATE TABLE IF NOT EXISTS curriculum_category (
    curriculum_id INT NOT NULL,
    category_code VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL,
    required_au DECIMAL(6,2) NOT NULL,
    PRIMARY KEY (curriculum_id, category_code),
    FOREIGN KEY (curriculum_id) REFERENCES programme_curriculum(curriculum_id) ON DELETE CASCADE,
    CHECK (required_au >= 0)
);

CREATE TABLE IF NOT EXISTS curriculum_elective_group (
    curriculum_id INT NOT NULL,
    category_code VARCHAR(20) NOT NULL,
    group_code VARCHAR(30) NOT NULL,
    title VARCHAR(100) NOT NULL,
    required_au DECIMAL(6,2) NOT NULL,
    PRIMARY KEY (curriculum_id, category_code, group_code),
    FOREIGN KEY (curriculum_id, category_code) REFERENCES curriculum_category(curriculum_id, category_code) ON DELETE CASCADE,
    CHECK (required_au >= 0)
);

-- Exactly one category/group per course per curriculum: no cross-bucket credit.
-- No catalogue FK: historical and synthetic course requirements remain visible.
CREATE TABLE IF NOT EXISTS curriculum_course (
    curriculum_id INT NOT NULL,
    course_code VARCHAR(10) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    category_code VARCHAR(20) NOT NULL,
    group_code VARCHAR(30) NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    recommended_study_year INT NULL,
    recommended_semester INT NULL,
    verified_min_study_year INT NULL,
    verification_source VARCHAR(255) NULL,
    PRIMARY KEY (curriculum_id, course_code),
    FOREIGN KEY (curriculum_id, category_code) REFERENCES curriculum_category(curriculum_id, category_code) ON DELETE CASCADE,
    FOREIGN KEY (curriculum_id, category_code, group_code) REFERENCES curriculum_elective_group(curriculum_id, category_code, group_code) ON DELETE CASCADE,
    CHECK (recommended_study_year IS NULL OR recommended_study_year BETWEEN 1 AND 6),
    CHECK (recommended_semester IS NULL OR recommended_semester BETWEEN 1 AND 3),
    CONSTRAINT chk_curriculum_verified_year CHECK (
        (verified_min_study_year IS NULL AND verification_source IS NULL) OR
        (verified_min_study_year IS NOT NULL AND verified_min_study_year BETWEEN 1 AND 6
         AND verification_source IS NOT NULL AND CHAR_LENGTH(TRIM(verification_source)) > 0))
);
