
-- Active conversation shared across Smart STARS channels.
-- Stores the current conversation for each demo student.

CREATE TABLE IF NOT EXISTS ai_active_conversation (
    student_id VARCHAR(15)
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_0900_ai_ci
        NOT NULL,

    conversation_id BIGINT UNSIGNED NOT NULL,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (student_id),

    CONSTRAINT fk_active_chat_student
        FOREIGN KEY (student_id)
        REFERENCES student(student_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_active_chat_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversation(conversation_id)
        ON DELETE CASCADE
);
