
function getStudentId(res) {
  // Must be populated by trusted authentication
  // middleware in a future integration step.
  return res.locals.authenticatedStudentId ?? null;
}

// GET /api/chat/conversations
const getChatConversations = async (req, res) => {
  const studentId = getStudentId(res);

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Please sign in to access conversations."
    });
  }

  try {
    const { listConversations } = await import(
      "../services/conversationService.mjs"
    );

    const conversations = await listConversations({
      studentId
    });

    return res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations
    });

  } catch (error) {
    console.error("Conversation listing error:", error);

    return res.status(503).json({
      success: false,
      message: "Unable to retrieve conversations."
    });
  }
};

// GET /api/chat/conversations/:conversationId/messages
const getChatMessages = async (req, res) => {
  const studentId = getStudentId(res);

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Please sign in to access messages."
    });
  }

  const rawId = req.params.conversationId;

  if (!/^[1-9]\d*$/.test(rawId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid conversation ID."
    });
  }

  const conversationId = Number(rawId);

  if (!Number.isSafeInteger(conversationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid conversation ID."
    });
  }

  try {
    const { getConversationMessages } = await import(
      "../services/conversationService.mjs"
    );

    const messages = await getConversationMessages({
      studentId,
      conversationId
    });

    if (messages === null) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found."
      });
    }

    return res.status(200).json({
      success: true,
      conversation_id: conversationId,
      count: messages.length,
      data: messages
    });

  } catch (error) {
    console.error("Conversation history error:", error);

    return res.status(503).json({
      success: false,
      message: "Unable to retrieve conversation history."
    });
  }
};


/**
 * GET /api/chat/active
 *
 * Return the active conversation and its recent messages
 * for the student identified by trusted backend context.
 */
const getActiveChat = async (req, res) => {
  const studentId = getStudentId(res);

  if (!studentId) {
    return res.status(401).json({
      success: false,
      message: "Student identity is required."
    });
  }

  try {
    const {
      getActiveConversationId,
      getConversationMessages
    } = await import(
      "../services/conversationService.mjs"
    );

    const conversationId =
      await getActiveConversationId({ studentId });

    // No active conversation selected yet.
    if (conversationId === null) {
      return res.status(200).json({
        success: true,
        conversation_id: null,
        count: 0,
        data: []
      });
    }

    // Retrieve messages after verifying ownership.
    const messages = await getConversationMessages({
      studentId,
      conversationId,
      limit: 30
    });

    if (messages === null) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found."
      });
    }

    return res.status(200).json({
      success: true,
      conversation_id: conversationId,
      count: messages.length,
      data: messages
    });

  } catch (error) {
    console.error(
      "Active conversation retrieval error:",
      error
    );

    return res.status(503).json({
      success: false,
      message: "Unable to load active conversation."
    });
  }
};

module.exports = {
  getChatConversations,
  getChatMessages,
  getActiveChat
};