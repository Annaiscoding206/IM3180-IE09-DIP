-- Existing-database extension. Retains completed_course as historical data.
-- Re-running imports only previously unmigrated legacy pairs; no seed reset.
USE stars_companion_db;

CREATE TABLE IF NOT EXISTS academic_record (
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

START TRANSACTION;
-- Student locks serialize supported imports and new request FK inserts.
SELECT student_id FROM student
WHERE student_id IN (SELECT student_id FROM completed_course)
ORDER BY student_id FOR UPDATE;

CREATE TEMPORARY TABLE degree_audit_legacy_import AS
SELECT cc.student_id, cc.course_code FROM completed_course cc
WHERE NOT EXISTS (
    SELECT 1 FROM academic_record ar
    WHERE ar.student_id = cc.student_id AND ar.source_key = CONCAT('legacy:', cc.course_code)
);

-- Parent requests always lock BEFORE any plan invalidation.
SELECT request_id FROM planning_request
WHERE student_id IN (SELECT student_id FROM degree_audit_legacy_import)
ORDER BY request_id FOR UPDATE;

-- No historical title, term, grade or earned AU is present in completed_course.
-- Do not infer it from today's Course Explorer catalogue.
INSERT INTO academic_record
    (student_id, course_code, course_title, academic_year, semester, result, grade, earned_au, source, source_key)
SELECT student_id, course_code, NULL, NULL, NULL, 'PASSED', NULL, NULL,
       'LEGACY_COMPLETED', CONCAT('legacy:', course_code)
FROM degree_audit_legacy_import;

UPDATE plan p JOIN planning_request pr ON pr.request_id = p.request_id
SET p.rank_no = NULL, p.match_score = NULL,
    p.status = CASE WHEN p.status = 'SELECTED' THEN 'GENERATED' ELSE p.status END,
    p.updated_at = CURRENT_TIMESTAMP
WHERE pr.student_id IN (SELECT student_id FROM degree_audit_legacy_import) AND p.status <> 'ARCHIVED';
UPDATE planning_request SET updated_at = CURRENT_TIMESTAMP
WHERE student_id IN (SELECT student_id FROM degree_audit_legacy_import);

DROP TEMPORARY TABLE degree_audit_legacy_import;
COMMIT;
