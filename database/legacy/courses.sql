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
