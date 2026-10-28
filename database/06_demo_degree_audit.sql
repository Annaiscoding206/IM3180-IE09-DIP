-- ============================================================
-- Demo data for degree audit
-- Course type migration for existing local databases
-- Safe to run more than once.
-- ============================================================

USE stars_companion_db;

CREATE TABLE IF NOT EXISTS demo_degree_audit (
    student_id VARCHAR(15) NOT NULL,
	course_code VARCHAR(10) NOT NULL,
	
	course_title VARCHAR(255) NOT NULL,
	taken_year INT NOT NULL,
	taken_semester INT NOT NULL,
	
	au INT NOT NULL,
	grade VARCHAR(5) NOT NULL,
    

    PRIMARY KEY (student_id, course_code),
	
	FOREIGN KEY (student_id, course_code)
		REFERENCES completed_course(student_id, course_code)
);

INSERT INTO completed_course
    (student_id, course_code)
VALUES
    ('DEMO001', 'PH1012'),
	('DEMO001', 'DA1000');

INSERT IGNORE INTO demo_degree_audit (student_id, course_code, course_title, taken_year, taken_semester, au, grade)
VALUES
    ('DEMO001', 'MH1810', 'Mathematics 1', 1, 1, 3, 'B'),
	('DEMO001', 'IE2108', 'Digital Electronics', 2, 1, 3, 'B'),
	('DEMO001', 'DA1000', 'Thinking & Communicating Visually', 2, 1, 3, 'B+'),
	('DEMO001', 'PH1012', 'Physics A', 2, 1, 4, 'B+')
    ;
	
