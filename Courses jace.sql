CREATE DATABASE courses;
USE courses;
CREATE TABLE course_info (
         course_code VARCHAR(10) NOT NULL,
         index_no INT NOT NULL,
         course_name VARCHAR(255) NOT NULL,
     
         au INT NOT NULL,
         vacancy INT NOT NULL DEFAULT 0,
     
         prerequisite TEXT NULL,
         exemptions TEXT NULL,
     
         grading_type ENUM('LETTER_GRADED', 'PASS_FAIL') NOT NULL,
     
         exam_datetime DATETIME NULL,
     
         bde BOOLEAN NOT NULL DEFAULT FALSE,
         gepe BOOLEAN NOT NULL DEFAULT FALSE,
     
         academic_year VARCHAR(20) NOT NULL,
         semester INT NOT NULL,
     
         mutually_exclusive_with TEXT NULL,
     
         PRIMARY KEY (course_code, index_no)
     );
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
     
         FOREIGN KEY (course_code, index_no)
             REFERENCES course_info(course_code, index_no)
             ON DELETE CASCADE
             ON UPDATE CASCADE
     );
USE courses;
INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     ('DA1000', 32612, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100'),
     ('DA1000', 32614, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100'),
     ('DA1000', 32615, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100'),
     ('DA1000', 32616, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100'),
     ('DA1000', 32617, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100'),
     ('DA1000', 32618, 'Thinking & Communicating Visually I', 3, 0, NULL, 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, 'DA1100');
INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     ('DA1000', 32612, 'TUTORIAL', 'G2', 'MON', '13:30:00', '16:20:00', 'ART-2-28'),
     ('DA1000', 32614, 'TUTORIAL', 'G4', 'TUE', '13:30:00', '16:20:00', 'ART-2-28'),
     ('DA1000', 32615, 'TUTORIAL', 'G5', 'WED', '13:30:00', '16:20:00', 'ART-2-29'),
     ('DA1000', 32616, 'TUTORIAL', 'G6', 'TUE', '17:30:00', '20:20:00', 'ART-2-28'),
     ('DA1000', 32617, 'TUTORIAL', 'G7', 'THU', '09:30:00', '12:20:00', 'ART-2-28'),
     ('DA1000', 32618, 'TUTORIAL', 'G8', 'FRI', '09:30:00', '12:20:00', 'ART-2-28');
INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     (
         'DA2002',
         32621,
         'Thinking & Communicating Visually II',
         3,
         0,
         'DA1000',
         'ADMC',
         'LETTER_GRADED',
         NULL,
         FALSE,
         FALSE,
         '2026-2027',
         1,
         NULL
     );
INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     (
         'DA2002',
         32621,
         'TUTORIAL',
         'G2',
         'THU',
         '09:30:00',
         '12:20:00',
         'ART-2-21'
     );
INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     ('DA3000', 32631, 'Thinking & Communicating Visually III', 3, 0, 'DA1000', 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, NULL),
     ('DA3000', 32632, 'Thinking & Communicating Visually III', 3, 0, 'DA1000', 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, NULL),
     ('DA3000', 32633, 'Thinking & Communicating Visually III', 3, 0, 'DA1000', 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, NULL),
     ('DA3000', 32634, 'Thinking & Communicating Visually III', 3, 0, 'DA1000', 'ADMC', 'LETTER_GRADED', NULL, FALSE, FALSE, '2026-2027', 1, NULL);
INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     ('DA3000', 32631, 'TUTORIAL', 'G1', 'MON', '09:30:00', '12:20:00', 'S2.2-B4-04'),
     ('DA3000', 32632, 'TUTORIAL', 'G2', 'MON', '14:30:00', '17:20:00', 'S2.2-B4-04'),
     ('DA3000', 32633, 'TUTORIAL', 'G3', 'TUE', '14:30:00', '17:20:00', 'S2.2-B4-04'),
     ('DA3000', 32634, 'TUTORIAL', 'G4', 'WED', '09:30:00', '12:20:00', 'S2.2-B4-04');
USE courses;

INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     (   'CS2024', 32601, 'Web Design & Technologies', 3, 0, NULL,
         'CSC, CSEC, CVEC, DSAI, ECDS, ECMA, ECON, ECPP, ECPS, EEE, EEEC, EESS, ELAH, ELH, ELHS, ELPL, ENE, ENEC, ENG, ESPP, HIST, HSCN, HSLM, IEEC, LMEL, LMPL, LMS, MACS, MAEC, MAEO, MAT, MATH, ME(DES), ME(IDMS), ME(IMS), ME(NULL), ME(RMS), MEEC(DES), MEEC(IDMS), MEEC(NULL), MEEC(RMS), MS, MS-2ndMaj/Spec(MSB), MTEC, PESC, PHIL, PHMS, PHY, PLCN, PLHS, PPGA, PSLM, PSMA, PSY, REP, ROBO, SCED, SOC, SPPE, SSM',
         'LETTER_GRADED', NULL, TRUE, FALSE, '2026-2027', 1, NULL ),
     (   'CS2024', 32602, 'Web Design & Technologies', 3, 0, NULL,
         'CSC, CSEC, CVEC, DSAI, ECDS, ECMA, ECON, ECPP, ECPS, EEE, EEEC, EESS, ELAH, ELH, ELHS, ELPL, ENE, ENEC, ENG, ESPP, HIST, HSCN, HSLM, IEEC, LMEL, LMPL, LMS, MACS, MAEC, MAEO, MAT, MATH, ME(DES), ME(IDMS), ME(IMS), ME(NULL), ME(RMS), MEEC(DES), MEEC(IDMS), MEEC(NULL), MEEC(RMS), MS, MS-2ndMaj/Spec(MSB), MTEC, PESC, PHIL, PHMS, PHY, PLCN, PLHS, PPGA, PSLM, PSMA, PSY, REP, ROBO, SCED, SOC, SPPE, SSM',
         'LETTER_GRADED', NULL, TRUE, FALSE, '2026-2027', 1, NULL );

INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     ( 'CS2024', 32601, 'LECTURE', 'LE', 'THU', '08:30:00', '09:20:00', 'LHS-LT' ),
     ( 'CS2024', 32601, 'TUTORIAL', 'T1', 'THU', '09:30:00', '11:20:00', 'S2.2-B4-04' ),
     ( 'CS2024', 32602, 'LECTURE', 'LE', 'THU', '08:30:00', '09:20:00', 'LHS-LT' ),
     ( 'CS2024', 32602, 'TUTORIAL', 'T2', 'THU', '13:30:00', '15:20:00', 'S2.2-B4-04' );

INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     (
         'IE3014', 32421, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL, 
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' ),
     (
         'IE3014', 32422, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL,
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' ),
     (
         'IE3014', 32423, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL,
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' ),
     (
         'IE3014', 32424, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL,
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' ),
     (
         'IE3014', 32425, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL,
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' ),
     (
         'IE3014', 32426, 'Digital Signal Processing', 3, 0, 'EE2010 OR IM2004 OR IE2010 OR IE2110', NULL,
         'LETTER_GRADED', '2026-12-03 09:00:00', TRUE, FALSE, '2026-2027', 1, 'CE3007' );

INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     ( 'IE3014', 32421, 'TUTORIAL', 'EE01', 'MON', '09:30:00', '10:50:00', 'TR+89' ),
     ( 'IE3014', 32422, 'TUTORIAL', 'EE02', 'MON', '13:30:00', '14:50:00', 'TR+89' ),
     ( 'IE3014', 32423, 'TUTORIAL', 'EE03', 'TUE', '09:30:00', '10:50:00', 'TR+89' ),
     ( 'IE3014', 32424, 'TUTORIAL', 'EE04', 'WED', '09:30:00', '10:50:00', 'TR+91' ),
     ( 'IE3014', 32425, 'TUTORIAL', 'EE05', 'THU', '09:30:00', '10:50:00', 'TR+88' ),
     ( 'IE3014', 32426, 'TUTORIAL', 'EE06', 'THU', '13:30:00', '14:50:00', 'TR+88' );

INSERT INTO course_info (
         course_code,
         index_no,
         course_name,
         au,
         vacancy,
         prerequisite,
         exemptions,
         grading_type,
         exam_datetime,
         bde,
         gepe,
         academic_year,
         semester,
         mutually_exclusive_with
     )
     VALUES
     ( 'IE3102', 32441, 'Microprocessors', 3, 0, NULL, NULL, 'LETTER_GRADED', '2026-11-24 09:00:00', TRUE, FALSE, '2026-2027', 1, NULL ),
     ( 'IE3102', 32442, 'Microprocessors', 3, 0, NULL, NULL, 'LETTER_GRADED', '2026-11-24 09:00:00', TRUE, FALSE, '2026-2027', 1, NULL ),
     ( 'IE3102', 32443, 'Microprocessors', 3, 0, NULL, NULL, 'LETTER_GRADED', '2026-11-24 09:00:00', TRUE, FALSE, '2026-2027', 1, NULL ),
     ( 'IE3102', 32444, 'Microprocessors', 3, 0, NULL, NULL, 'LETTER_GRADED', '2026-11-24 09:00:00', TRUE, FALSE, '2026-2027', 1, NULL );

INSERT INTO class_slots (
         course_code,
         index_no,
         class_type,
         class_group,
         day_of_week,
         start_time,
         end_time,
         venue
     )
     VALUES
     ( 'IE3102', 32441, 'TUTORIAL', 'EE01', 'TUE', '11:30:00', '12:50:00', 'TR+88' ),
     ( 'IE3102', 32442, 'TUTORIAL', 'EE02', 'WED', '09:30:00', '10:50:00', 'TR+88' ),
     ( 'IE3102', 32443, 'TUTORIAL', 'EE03', 'THU', '09:30:00', '10:50:00', 'TR+90' ),
     ( 'IE3102', 32444, 'TUTORIAL', 'EE04', 'THU', '13:30:00', '14:50:00', 'TR+90' );

-- Additional course data for Courses jace.sql
-- AY 2026-2027 Semester 1
-- Courses: MH1810, MH1811, IE4758, SC5002
-- Append this file AFTER the existing contents of Courses jace.sql.
--
-- Schema notes:
-- 1) The existing schema has no field for teaching-week remarks.
--    For MH1810 index 23454, the tutorial venue changes from LHN-TR+33 (Wk2-5)
--    to TRX43 (Wk6-13), so both venues are preserved in one venue string.
-- 2) Following the existing team file, programme-unavailability data is stored in
--    the `exemptions` column even though that column name is broader/ambiguous.
-- 3) Vacancy values were not provided, so they are set to 0, consistent with the existing file.
-- 4) MH1811 source states MH1810 as a corequisite; the current schema has only one
--    prerequisite text field, so it is stored as "MH1810 (Corequisite)".

USE courses;

-- ============================================================
-- COURSE INFO
-- ============================================================

INSERT INTO course_info (
    course_code,
    index_no,
    course_name,
    au,
    vacancy,
    prerequisite,
    exemptions,
    grading_type,
    exam_datetime,
    bde,
    gepe,
    academic_year,
    semester,
    mutually_exclusive_with
)
VALUES
    ('MH1810', 15091, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15092, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15093, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15094, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15095, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15096, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15097, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15098, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15099, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 15100, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23438, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23439, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23440, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23441, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23442, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23443, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23444, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23445, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23446, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23447, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23448, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23449, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23450, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23451, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23452, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23453, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 23454, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28121, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28122, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28123, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28124, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28125, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 28126, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32041, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32042, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32043, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32044, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32045, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32046, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32047, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32048, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32049, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32050, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32051, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32052, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32053, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32054, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32055, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32056, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32057, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32058, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32059, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32077, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 32078, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 50011, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55148, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55149, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55150, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55151, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55152, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55153, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55154, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55155, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55156, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1810', 55157, 'Mathematics 1', 3, 0, NULL, 'BCE(2024-2025), BCG(2024-2025), CE(2024-2025), CEEC(2024-2025), CSC(2024-2025), CSEC(2024-2025), DSAI, MACS', 'LETTER_GRADED', '2026-11-23 09:00:00', FALSE, FALSE, '2026-2027', 1, 'CE1011, CZ1011, MH1100, MH1101, MH1800, MH1801, MH2813'),
    ('MH1811', 50001, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50002, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50003, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50004, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50005, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50006, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('MH1811', 50007, 'Mathematics 2', 3, 0, 'MH1810 (Corequisite)', 'ENG(NULL)', 'LETTER_GRADED', '2026-12-02 09:00:00', FALSE, FALSE, '2026-2027', 1, 'MH1100, MH1101, MH1801, MS2900'),
    ('IE4758', 32558, 'Information Security', 3, 0, 'IE1005 OR EE1005', 'IEM(2019-2021)(Direct Entry)', 'LETTER_GRADED', '2026-11-26 09:00:00', TRUE, FALSE, '2026-2027', 1, 'IM3003'),
    ('SC5002', 10600, 'Artificial Intelligence Fundamentals & Applications', 3, 0, 'SC1003 OR SC5001 OR CV1014 OR BS1009 OR MS1008 OR MA1008 OR PS0001 OR IE2108 OR RE1016 OR CS4313', 'ACDA, AISC, BACF, BCE, BCG, CE, CEEC, COMP, CSC, CSEC, DSAI, ECDS, IEEC, IEM*, MACS, REP(CE), REP(CSC); 2nd Maj/Spec(DANA)', 'LETTER_GRADED', NULL, TRUE, FALSE, '2026-2027', 1, 'SC1315, SC3000, SC4000');

-- ============================================================
-- CLASS SLOTS
-- ============================================================

INSERT INTO class_slots (
    course_code,
    index_no,
    class_type,
    class_group,
    day_of_week,
    start_time,
    end_time,
    venue
)
VALUES
    ('MH1810', 15091, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15091, 'TUTORIAL', 'MAT1', 'TUE', '10:30:00', '11:20:00', 'TR+36'),
    ('MH1810', 15092, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15092, 'TUTORIAL', 'MAT2', 'TUE', '12:30:00', '13:20:00', 'TR+36'),
    ('MH1810', 15093, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15093, 'TUTORIAL', 'MAT3', 'TUE', '13:30:00', '14:20:00', 'TR+36'),
    ('MH1810', 15094, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15094, 'TUTORIAL', 'MAT4', 'THU', '11:30:00', '12:20:00', 'TR+36'),
    ('MH1810', 15095, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15095, 'TUTORIAL', 'MAT5', 'THU', '15:30:00', '16:20:00', 'TR+36'),
    ('MH1810', 15096, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15096, 'TUTORIAL', 'MAT6', 'THU', '16:30:00', '17:20:00', 'TR+36'),
    ('MH1810', 15097, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15097, 'TUTORIAL', 'MAT2', 'TUE', '12:30:00', '13:20:00', 'TR+36'),
    ('MH1810', 15098, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15098, 'TUTORIAL', 'MAT3', 'TUE', '13:30:00', '14:20:00', 'TR+36'),
    ('MH1810', 15099, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15099, 'TUTORIAL', 'MAT5', 'THU', '15:30:00', '16:20:00', 'TR+36'),
    ('MH1810', 15100, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 15100, 'TUTORIAL', 'MAT6', 'THU', '16:30:00', '17:20:00', 'TR+36'),
    ('MH1810', 23438, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23438, 'TUTORIAL', 'MA1', 'MON', '14:30:00', '15:20:00', 'TR+109'),
    ('MH1810', 23439, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23439, 'TUTORIAL', 'MA2', 'MON', '14:30:00', '15:20:00', 'TR+106'),
    ('MH1810', 23440, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23440, 'TUTORIAL', 'MA3', 'MON', '15:30:00', '16:20:00', 'TR+106'),
    ('MH1810', 23441, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23441, 'TUTORIAL', 'MA4', 'MON', '15:30:00', '16:20:00', 'TR+107'),
    ('MH1810', 23442, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23442, 'TUTORIAL', 'MA5', 'MON', '15:30:00', '16:20:00', 'TR+108'),
    ('MH1810', 23443, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23443, 'TUTORIAL', 'MA6', 'TUE', '15:30:00', '16:20:00', 'TR+36'),
    ('MH1810', 23444, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23444, 'TUTORIAL', 'MA7', 'TUE', '15:30:00', '16:20:00', 'TR+29'),
    ('MH1810', 23445, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23445, 'TUTORIAL', 'MA8', 'TUE', '15:30:00', '16:20:00', 'TR+106'),
    ('MH1810', 23446, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23446, 'TUTORIAL', 'MA9', 'WED', '12:30:00', '13:20:00', 'TR+114'),
    ('MH1810', 23447, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23447, 'TUTORIAL', 'MA10', 'WED', '12:30:00', '13:20:00', 'TR+112'),
    ('MH1810', 23448, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23448, 'TUTORIAL', 'MA11', 'WED', '12:30:00', '13:20:00', 'TR+113'),
    ('MH1810', 23449, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23449, 'TUTORIAL', 'MA12', 'MON', '11:30:00', '12:20:00', 'LHN-TR+16'),
    ('MH1810', 23450, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23450, 'TUTORIAL', 'MA13', 'MON', '12:30:00', '13:20:00', 'LHN-TR+16'),
    ('MH1810', 23451, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23451, 'TUTORIAL', 'MA14', 'MON', '12:30:00', '13:20:00', 'TR+33'),
    ('MH1810', 23452, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23452, 'TUTORIAL', 'MA15', 'WED', '12:30:00', '13:20:00', 'LHN-TR+17'),
    ('MH1810', 23453, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23453, 'TUTORIAL', 'MA16', 'WED', '12:30:00', '13:20:00', 'LHN-TR+16'),
    ('MH1810', 23454, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 23454, 'TUTORIAL', 'MA17', 'WED', '12:30:00', '13:20:00', 'LHN-TR+33 / TRX43'),
    ('MH1810', 28121, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28121, 'TUTORIAL', 'CV1', 'WED', '13:30:00', '14:20:00', 'TRX43'),
    ('MH1810', 28122, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28122, 'TUTORIAL', 'CV2', 'WED', '13:30:00', '14:20:00', 'TR+36'),
    ('MH1810', 28123, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28123, 'TUTORIAL', 'CV3', 'WED', '13:30:00', '14:20:00', 'TR+34'),
    ('MH1810', 28124, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28124, 'TUTORIAL', 'CV4', 'WED', '13:30:00', '14:20:00', 'TR+31'),
    ('MH1810', 28125, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28125, 'TUTORIAL', 'CV5', 'WED', '13:30:00', '14:20:00', 'TR+110'),
    ('MH1810', 28126, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 28126, 'TUTORIAL', 'CV6', 'WED', '13:30:00', '14:20:00', 'TR+111'),
    ('MH1810', 32041, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32041, 'TUTORIAL', 'EE01', 'MON', '11:30:00', '12:20:00', 'TR+108'),
    ('MH1810', 32042, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32042, 'TUTORIAL', 'EE02', 'MON', '12:30:00', '13:20:00', 'TR+114'),
    ('MH1810', 32043, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32043, 'TUTORIAL', 'EE03', 'MON', '15:30:00', '16:20:00', 'TR+113'),
    ('MH1810', 32044, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32044, 'TUTORIAL', 'EE04', 'MON', '16:30:00', '17:20:00', 'TR+113'),
    ('MH1810', 32045, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32045, 'TUTORIAL', 'EE05', 'TUE', '12:30:00', '13:20:00', 'TR+107'),
    ('MH1810', 32046, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32046, 'TUTORIAL', 'EE06', 'TUE', '14:30:00', '15:20:00', 'TR+106'),
    ('MH1810', 32047, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32047, 'TUTORIAL', 'EE07', 'TUE', '15:30:00', '16:20:00', 'TR+107'),
    ('MH1810', 32048, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32048, 'TUTORIAL', 'EE08', 'TUE', '16:30:00', '17:20:00', 'TR+113'),
    ('MH1810', 32049, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32049, 'TUTORIAL', 'EE09', 'WED', '12:30:00', '13:20:00', 'TR+106'),
    ('MH1810', 32050, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32050, 'TUTORIAL', 'EE10', 'WED', '14:30:00', '15:20:00', 'TR+110'),
    ('MH1810', 32051, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32051, 'TUTORIAL', 'EE11', 'WED', '15:30:00', '16:20:00', 'TR+31'),
    ('MH1810', 32052, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32052, 'TUTORIAL', 'EE12', 'WED', '13:30:00', '14:20:00', 'TR+108'),
    ('MH1810', 32053, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32053, 'TUTORIAL', 'EE13', 'THU', '11:30:00', '12:20:00', 'TR+112'),
    ('MH1810', 32054, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32054, 'TUTORIAL', 'EE14', 'THU', '13:30:00', '14:20:00', 'TR+107'),
    ('MH1810', 32055, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32055, 'TUTORIAL', 'EE15', 'THU', '16:30:00', '17:20:00', 'TR+107'),
    ('MH1810', 32056, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32056, 'TUTORIAL', 'EE16', 'THU', '10:30:00', '11:20:00', 'TR+113'),
    ('MH1810', 32057, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32057, 'TUTORIAL', 'EE17', 'FRI', '10:30:00', '11:20:00', 'TR+106'),
    ('MH1810', 32058, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32058, 'TUTORIAL', 'EE18', 'FRI', '11:30:00', '12:20:00', 'TR+106'),
    ('MH1810', 32059, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32059, 'TUTORIAL', 'EE19', 'FRI', '11:30:00', '12:20:00', 'TR+113'),
    ('MH1810', 32077, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32077, 'TUTORIAL', 'EE20', 'FRI', '11:30:00', '12:20:00', 'TR+114'),
    ('MH1810', 32078, 'LECTURE', 'LE1', 'MON', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 32078, 'TUTORIAL', 'EE21', 'FRI', '13:30:00', '14:20:00', 'TR+114'),
    ('MH1810', 50011, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 50011, 'TUTORIAL', 'A01', 'FRI', '14:30:00', '15:20:00', 'LHN-TR+05'),
    ('MH1810', 55148, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55148, 'TUTORIAL', 'B11', 'WED', '11:30:00', '12:20:00', 'TR+20'),
    ('MH1810', 55149, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55149, 'TUTORIAL', 'B12', 'WED', '11:30:00', '12:20:00', 'TR+21'),
    ('MH1810', 55150, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55150, 'TUTORIAL', 'B13', 'WED', '11:30:00', '12:20:00', 'TR+22'),
    ('MH1810', 55151, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55151, 'TUTORIAL', 'B14', 'WED', '11:30:00', '12:20:00', 'TR+23'),
    ('MH1810', 55152, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55152, 'TUTORIAL', 'C11', 'WED', '09:30:00', '10:20:00', 'TR+20'),
    ('MH1810', 55153, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55153, 'TUTORIAL', 'C12', 'WED', '11:30:00', '12:20:00', 'TR+106'),
    ('MH1810', 55154, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55154, 'TUTORIAL', 'C13', 'WED', '11:30:00', '12:20:00', 'TR+108'),
    ('MH1810', 55155, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55155, 'TUTORIAL', 'C14', 'FRI', '12:30:00', '13:20:00', 'TR+20'),
    ('MH1810', 55156, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55156, 'TUTORIAL', 'C15', 'FRI', '12:30:00', '13:20:00', 'TR+21'),
    ('MH1810', 55157, 'LECTURE', 'LE2', 'FRI', '08:30:00', '10:20:00', 'LKC-LT'),
    ('MH1810', 55157, 'TUTORIAL', 'C16', 'FRI', '12:30:00', '13:20:00', 'TR+23'),
    ('MH1811', 50001, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50001, 'TUTORIAL', 'C01', 'MON', '12:30:00', '13:20:00', 'TR+111'),
    ('MH1811', 50002, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50002, 'TUTORIAL', 'C02', 'MON', '13:30:00', '14:20:00', 'TR+111'),
    ('MH1811', 50003, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50003, 'TUTORIAL', 'C03', 'TUE', '12:30:00', '13:20:00', 'TR+109'),
    ('MH1811', 50004, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50004, 'TUTORIAL', 'C04', 'TUE', '13:30:00', '14:20:00', 'TR+109'),
    ('MH1811', 50005, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50005, 'TUTORIAL', 'C05', 'WED', '12:30:00', '13:20:00', 'TR+111'),
    ('MH1811', 50006, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50006, 'TUTORIAL', 'C06', 'THU', '11:30:00', '12:20:00', 'TR+111'),
    ('MH1811', 50007, 'LECTURE', 'LE', 'FRI', '08:30:00', '10:20:00', 'LT20'),
    ('MH1811', 50007, 'TUTORIAL', 'C07', 'THU', '12:30:00', '13:20:00', 'TR+111'),
    ('IE4758', 32558, 'LECTURE', 'EELE', 'TUE', '13:30:00', '16:20:00', 'LT23'),
    ('SC5002', 10600, 'LECTURE', 'SCL5', 'TUE', '08:30:00', '10:20:00', 'LHN-TR+37'),
    ('SC5002', 10600, 'TUTORIAL', 'MIAI', 'THU', '16:30:00', '17:20:00', 'LHN-TR+36');
