
-- ============================================================
-- SMART STARS AI CHAT HISTORY
-- ============================================================
-- Separate database extension for the AI assistant.
-- Supports shared conversations between website and Telegram.
-- Does not modify existing Student or Planning tables.
-- ============================================================


-- 1. AI CONVERSATIONS

CREATE TABLE IF NOT EXISTS ai_conversation (
    conversation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_id VARCHAR(15) NOT NULL,
    title VARCHAR(160) NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (conversation_id),

    INDEX idx_ai_conversation_student (
        student_id,
        updated_at
    ),

    CONSTRAINT fk_ai_conversation_student
        FOREIGN KEY (student_id)
        REFERENCES student(student_id)
        ON DELETE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


-- 2. AI MESSAGES

CREATE TABLE IF NOT EXISTS ai_message (
    message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT UNSIGNED NOT NULL,

    role ENUM('user', 'assistant') NOT NULL,

    content TEXT NOT NULL,

    source_channel ENUM(
        'website',
        'telegram'
    ) NOT NULL DEFAULT 'website',

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (message_id),

    INDEX idx_ai_message_conversation (
        conversation_id,
        message_id
    ),

    CONSTRAINT fk_ai_message_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversation(conversation_id)
        ON DELETE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;