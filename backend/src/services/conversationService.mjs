
import pool from "../config/db.js";

// Validate trusted student identity.
function validateStudentId(studentId) {
  if (
    typeof studentId !== "string" ||
    !studentId.trim() ||
    studentId.length > 15
  ) {
    throw new Error("A valid student identity is required.");
  }
}

// Validate conversation identifier.
function validateConversationId(conversationId) {
  if (
    !Number.isSafeInteger(conversationId) ||
    conversationId <= 0
  ) {
    throw new Error("Invalid conversation ID.");
  }
}

// 1. Create a conversation.
export async function createConversation({
  studentId,
  title = "New conversation"
}) {
  validateStudentId(studentId);

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160
  ) {
    throw new Error("Invalid conversation title.");
  }

  const [result] = await pool.query(
    `
    INSERT INTO ai_conversation (student_id, title)
    VALUES (?, ?)
    `,
    [studentId, title.trim()]
  );

  return {
    conversation_id: result.insertId,
    student_id: studentId,
    title: title.trim()
  };
}

// 2. Save a message to a student's conversation.
export async function saveMessage({
  studentId,
  conversationId,
  role,
  content,
  sourceChannel = "website"
}) {
  validateStudentId(studentId);
  validateConversationId(conversationId);

  if (!["user", "assistant"].includes(role)) {
    throw new Error("Invalid message role.");
  }

  if (!["website", "telegram"].includes(sourceChannel)) {
    throw new Error("Invalid message source channel.");
  }

  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 12000
  ) {
    throw new Error("Invalid message content.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify conversation ownership.
    // Lock the row while saving the message.
    const [conversations] = await connection.query(
      `
      SELECT conversation_id
      FROM ai_conversation
      WHERE conversation_id = ?
        AND student_id = ?
      FOR UPDATE
      `,
      [conversationId, studentId]
    );

    if (conversations.length === 0) {
      throw new Error("Conversation not found.");
    }

    const [result] = await connection.query(
      `
      INSERT INTO ai_message (
        conversation_id,
        role,
        content,
        source_channel
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        conversationId,
        role,
        content.trim(),
        sourceChannel
      ]
    );

    // Update conversation activity timestamp.
    await connection.query(
      `
      UPDATE ai_conversation
      SET updated_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ?
      `,
      [conversationId]
    );

    await connection.commit();

    return {
      message_id: result.insertId,
      conversation_id: conversationId,
      role,
      content: content.trim(),
      source_channel: sourceChannel
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}

// 3. Retrieve recent conversation messages.
export async function getConversationMessages({
  studentId,
  conversationId,
  limit = 30
}) {
  validateStudentId(studentId);
  validateConversationId(conversationId);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid message limit.");
  }

  // Verify the conversation belongs to this student.
  const [conversations] = await pool.query(
    `
    SELECT conversation_id
    FROM ai_conversation
    WHERE conversation_id = ?
      AND student_id = ?
    LIMIT 1
    `,
    [conversationId, studentId]
  );

  if (conversations.length === 0) {
    return null;
  }

  // Retrieve the newest messages first, then
  // reverse them into chronological order.
  const [messages] = await pool.query(
    `
    SELECT
      message_id,
      role,
      content,
      source_channel,
      created_at
    FROM ai_message
    WHERE conversation_id = ?
    ORDER BY message_id DESC
    LIMIT ?
    `,
    [conversationId, limit]
  );

  return messages.reverse();
}

// 4. List the student's conversations.
export async function listConversations({
  studentId,
  limit = 20
}) {
  validateStudentId(studentId);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid conversation limit.");
  }

  const [conversations] = await pool.query(
    `
    SELECT
      conversation_id,
      title,
      created_at,
      updated_at
    FROM ai_conversation
    WHERE student_id = ?
    ORDER BY updated_at DESC, conversation_id DESC
    LIMIT ?
    `,
    [studentId, limit]
  );

  return conversations;
}

/**
 * Atomically save one complete AI conversation turn.
 *
 * A turn contains:
 * - One user message
 * - One assistant response
 *
 * Both messages must be committed together.
 */
export async function saveConversationTurn({
  studentId,
  conversationId = null,
  title = "New conversation",
  userMessage,
  assistantMessage,
  sourceChannel = "website"
}) {
  validateStudentId(studentId);

  if (
    conversationId !== null &&
    (!Number.isSafeInteger(conversationId) ||
      conversationId <= 0)
  ) {
    throw new Error("Invalid conversation ID.");
  }

  if (!["website", "telegram"].includes(sourceChannel)) {
    throw new Error("Invalid source channel.");
  }

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160
  ) {
    throw new Error("Invalid conversation title.");
  }

  for (const content of [userMessage, assistantMessage]) {
    if (
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 12000
    ) {
      throw new Error("Invalid message content.");
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let savedConversationId = conversationId;

    // Create a conversation if this is the first turn.
    if (savedConversationId === null) {
      const [result] = await connection.query(
        `INSERT INTO ai_conversation (student_id, title)
         VALUES (?, ?)`,
        [studentId, title.trim()]
      );

      savedConversationId = result.insertId;

    } else {
      // Verify ownership and lock this conversation.
      const [rows] = await connection.query(
        `SELECT conversation_id
         FROM ai_conversation
         WHERE conversation_id = ?
           AND student_id = ?
         FOR UPDATE`,
        [savedConversationId, studentId]
      );

      if (rows.length === 0) {
        throw new Error(
          "Conversation not found for this student."
        );
      }
    }

    // Save both messages in the same transaction.
    await connection.query(
      `INSERT INTO ai_message
       (conversation_id, role, content, source_channel)
       VALUES
       (?, 'user', ?, ?),
       (?, 'assistant', ?, ?)`,
      [
        savedConversationId,
        userMessage.trim(),
        sourceChannel,
        savedConversationId,
        assistantMessage.trim(),
        sourceChannel
      ]
    );

    await connection.query(
      `UPDATE ai_conversation
       SET updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = ?`,
      [savedConversationId]
    );

    await connection.commit();

    return {
      conversation_id: savedConversationId,
      messages_saved: 2
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}

/**
 * Retrieve the active conversation for a student.
 *
 * Returns:
 * - conversation ID if one exists
 * - null if no active conversation has been selected
 */
export async function getActiveConversationId({ studentId }) {
  validateStudentId(studentId);

  const [rows] = await pool.query(
    `SELECT ac.conversation_id
     FROM ai_active_conversation ac
     INNER JOIN ai_conversation c
       ON ac.conversation_id = c.conversation_id
       AND ac.student_id = c.student_id
     WHERE ac.student_id = ?
     LIMIT 1`,
    [studentId]
  );

  if (rows.length === 0) {
    return null;
  }

  const conversationId = Number(rows[0].conversation_id);

  if (!Number.isSafeInteger(conversationId)) {
    throw new Error("Invalid stored conversation ID.");
  }

  return conversationId;
}

/**
 * Save or update a student's active conversation.
 *
 * The conversation must belong to the student.
 * Creates the active record if it does not exist.
 * Updates the record if one already exists.
 */
export async function setActiveConversationId({
  studentId,
  conversationId
}) {
  validateStudentId(studentId);

  if (
    !Number.isSafeInteger(conversationId) ||
    conversationId <= 0
  ) {
    throw new Error("Invalid conversation ID.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify that this conversation belongs to the student.
    const [rows] = await connection.query(
      `SELECT conversation_id
       FROM ai_conversation
       WHERE conversation_id = ?
         AND student_id = ?
       FOR UPDATE`,
      [conversationId, studentId]
    );

    if (rows.length === 0) {
      throw new Error(
        "Conversation not found for this student."
      );
    }

    // Insert or update the active conversation.
    await connection.query(
      `INSERT INTO ai_active_conversation
         (student_id, conversation_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         conversation_id = ?,
         updated_at = CURRENT_TIMESTAMP`,
      [studentId, conversationId, conversationId]
    );

    await connection.commit();

    return {
      success: true,
      student_id: studentId,
      conversation_id: conversationId
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}