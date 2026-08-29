use mysql;

CREATE DATABASE planner_db;

USE planner_db;


CREATE TABLE Student (
    student_id VARCHAR(15) PRIMARY KEY
);

CREATE TABLE Plan (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(15) NOT NULL,
    plan_name VARCHAR(15) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES Student(student_id)
        ON DELETE CASCADE
);

CREATE TABLE PlanCourse (
    plan_course_id INT AUTO_INCREMENT PRIMARY KEY,
    plan_id INT NOT NULL,
    course_id VARCHAR(20) NOT NULL,
    index_id VARCHAR(20) NOT NULL,
    locked BOOLEAN DEFAULT FALSE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (plan_id)
        REFERENCES Plan(plan_id)
        ON DELETE CASCADE,

    UNIQUE (plan_id, course_id)
);