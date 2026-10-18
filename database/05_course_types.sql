-- ============================================================
-- Smart STARS Companion
-- Course type migration for existing local databases
-- Safe to run more than once.
-- ============================================================

USE stars_companion_db;

CREATE TABLE IF NOT EXISTS course_type (
    course_code VARCHAR(10) NOT NULL,
    type_code ENUM('CORE', 'MPE', 'BDE') NOT NULL,

    PRIMARY KEY (course_code, type_code),
    INDEX idx_course_type_code (type_code)
);

INSERT IGNORE INTO course_type (course_code, type_code)
VALUES
    ('IE3014', 'CORE'),
    ('IE3014', 'MPE'),
    ('IE3014', 'BDE'),
    ('IE3102', 'CORE'),
    ('IE3102', 'BDE'),
    ('MH1810', 'CORE'),
    ('MH1811', 'CORE'),
    ('CS2024', 'MPE'),
    ('CS2024', 'BDE'),
    ('IE4758', 'MPE'),
    ('IE4758', 'BDE'),
    ('SC5002', 'MPE'),
    ('SC5002', 'BDE');
