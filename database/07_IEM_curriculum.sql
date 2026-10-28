-- ============================================================
-- Demo data for IEM curriculum
-- Course type migration for existing local databases
-- Safe to run more than once.
-- ============================================================

USE stars_companion_db;

CREATE TABLE IF NOT EXISTS demo_IEM_curriculum (
	programme VARCHAR(20) NOT NULL,
	course_code VARCHAR(10) NOT NULL,
	
	course_name VARCHAR(255) NOT NULL,
	course_year INT NOT NULL,
	course_semester INT NULL,
	
	type_code VARCHAR(10) NOT NULL,
	au INT NOT NULL,
	prerequisite_note VARCHAR(255) NULL,

    UNIQUE KEY unique_curriculum_course (programme, course_code)
);



INSERT IGNORE INTO demo_IEM_curriculum (programme, course_code, course_name, course_year, course_semester, type_code, au, prerequisite_note)
VALUES
    ('IEM', 'MH1810', 'Mathematics 1', 1, 1, 'C', 3, null),
	('IEM', 'PH1011', 'Physics', 1, 1, 'C', 3, NULL),
	('IEM', 'IE1005', 'From Computational Thinking to Programming', 1, 1, 'C', 3, NULL),
	('IEM', 'DA1000', 'Thinking and Communicating Visually I', 1, 1, 'C', 3, NULL),
	('IEM', 'CC0001', 'Inquiry and Communication in an Interdisciplinary World', 1, 1, 'CC', 2, NULL),
	('IEM', 'CC0002', 'Navigating the Digital World', 1, 1, 'CC', 2, NULL),
	
	('IEM', 'MH1811', 'Mathematics 2', 1, 2, 'C', 3, 'MH1810'),
	('IEM', 'IM1002', 'Analog Electronics', 1, 2, 'C', 3, NULL),
	('IEM', 'IM1003', 'Object-Oriented Programming', 1, 2, 'C', 3, NULL),
	('IEM', 'IE2104', 'Digital Electronics', 1, 2, 'C', 3, NULL),
	('IEM', 'EG1001', 'Engineers in Society', 1, 2, 'C', 2, NULL),
	('IEM', 'CC0003', 'Ethics and Civics in a Multicultural World', 1, 2, 'CC', 2, NULL),
	('IEM', 'CC0005', 'Healthy Living and Mental Wellbeing', 1, 2, 'CC', 3, NULL),
	
	('IEM', 'IE2108', 'Data Structures and Algorithms', 2, 1, 'C', 3, NULL),
	('IEM', 'IE2106', 'Engineering Mathematics I', 2, 1, 'C', 3, 'MH1811'),
	('IEM', 'IE0005', 'Introduction to Data Science and Artificial Intelligence', 2, 1, 'FC', 3, NULL),
	('IEM', 'CC0006', 'Sustainability: Society, Economy and Environment', 2, 1, 'CC', 3, NULL),
	('IEM', 'ML0004', 'Career and Entrepreneurial Development for the Future World', 2, 1, 'CC', 2, NULL),
	
	('IEM', 'IE4001', 'Software Engineering', 2, 2, 'C', 3, NULL),
	('IEM', 'IE3017', 'Computer Communications', 2, 2, 'C', 3, NULL),
	('IEM', 'IE2110', 'Signals and Systems', 2, 2, 'C', 3, NULL),
	('IEM', 'IE2107', 'Engineering Mathematics II', 2, 2, 'C', 3, NULL),
	('IEM', 'IM2073', 'Introduction to Design and Project', 2, 2, 'C', 2, NULL),
	('IEM', 'DA2002', 'Thinking and Communicating Visually II', 2, 2, 'C', 3, 'DA1000'),
	('IEM', 'CC0007', 'Science and Technology for Humanity', 2, 2, 'CC', 3, NULL),
	
	('IEM', 'IM3180', 'Design and Innovation Project', 3, 1, 'C', 3, NULL),
	('IEM', 'HW0288', 'Engineering Communication', 3, 1, 'FC', 2, NULL),
	
	('IEM', 'IM3279', 'Professional Internship', 3, 2, 'FC', 10, NULL),
	
	('IEM', 'IM4080', 'Final Year Project', 4, NULL, 'C', 8, 'Spans both semesters'),
	('IEM', 'DA3000', 'Thinking and Communicating Visually III', 4, 1, 'C', 3, NULL)
	
    ;
	
