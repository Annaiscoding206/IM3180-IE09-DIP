-- Durable, request-bound confirmation state shared by website and Telegram.
-- This is draft metadata, not a second preference authority. Saved preferences
-- remain in planning_day_preference / planning_time_preference / planning_objective.
CREATE TABLE IF NOT EXISTS ai_preference_draft (
    conversation_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    draft_id CHAR(36) NOT NULL UNIQUE,
    request_id INT NOT NULL,
    payload JSON NOT NULL,
    status ENUM('clarification_required', 'ready_for_confirmation', 'saved') NOT NULL,
    saved_at TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversation(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES planning_request(request_id) ON DELETE CASCADE
);
