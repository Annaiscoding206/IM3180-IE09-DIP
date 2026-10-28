INSERT IGNORE INTO completed_course
    (student_id, course_code)
VALUES
	('DEMO001', 'DA1000');

INSERT IGNORE INTO demo_degree_audit (student_id, course_code, course_title, taken_year, taken_semester, au, grade)
VALUES
    ('DEMO001', 'MH1810', 'Mathematics 1', 1, 1, 3, 'B'),
	('DEMO001', 'IE2108', 'Digital Electronics', 2, 1, 3, 'B'),
	('DEMO001', 'DA1000', 'Thinking & Communicating Visually', 2, 1, 3, 'B+'),
	('DEMO001', 'PH1012', 'Physics A', 2, 1, 4, 'B+')
    ;

DELETE FROM demo_degree_audit
WHERE student_id = 'DEMO001'
AND course_code = 'IE2110';

SELECT *
FROM demo_degree_audit
WHERE student_id = 'DEMO001'
ORDER BY taken_year, taken_semester;