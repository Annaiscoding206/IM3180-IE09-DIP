-- Day-specific hard unavailability for existing installations.
-- This extension does not alter global time preferences or seed records.
USE stars_companion_db;

CREATE TABLE IF NOT EXISTS planning_blocked_period (
    block_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    day_of_week ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    CONSTRAINT fk_blocked_period_request
        FOREIGN KEY (request_id)
        REFERENCES planning_request(request_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_blocked_period_time CHECK (end_time > start_time),
    UNIQUE KEY uq_blocked_period (request_id, day_of_week, start_time, end_time)
);
