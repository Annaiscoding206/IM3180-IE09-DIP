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