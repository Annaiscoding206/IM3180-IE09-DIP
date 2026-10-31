
const LOCAL_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1"
]);

const sendChatMessage = async (req, res) => {
  // Temporary restriction for local development.
  // Real authentication is required before deployment.
  if (
    process.env.NODE_ENV === "production" ||
    !LOCAL_ADDRESSES.has(req.socket.remoteAddress)
  ) {
    return res.status(403).json({
      success: false,
      message: "Chat API is not available in this environment."
    });
  }

  const { message, conversationId = null } = req.body || {};

  // 1. Validate message.
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 2000
  ) {
    return res.status(400).json({
      success: false,
      message: "Message must contain 1–2000 characters."
    });
  }

  // 2. Validate optional conversation ID.
  if (
    conversationId !== null &&
    (
      !Number.isSafeInteger(conversationId) ||
      conversationId <= 0
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid conversation ID."
    });
  }

  // 3. Student identity must come from trusted
  // authentication middleware.
  //
  // Never use req.body.studentId or query parameters
  // to determine which student is signed in.
  const studentId =
    res.locals.authenticatedStudentId ?? null;

  // 4. Existing conversations require authentication.
  if (conversationId !== null && !studentId) {
    return res.status(401).json({
      success: false,
      message: "Please sign in to continue this conversation."
    });
  }

  try {
    const { askSmartStars } = await import(
      "../services/chatService.mjs"
    );

    // Enable shared memory only for the local demo.
    const isLocalDemo =
      res.locals.isLocalDemoChat === true &&
      Boolean(studentId);

    let activeService = null;
    let effectiveConversationId = conversationId;

    if (isLocalDemo) {
      activeService = await import(
        "../services/conversationService.mjs"
      );

      // Retrieve the active conversation shared with Telegram.
      if (effectiveConversationId === null) {
        effectiveConversationId =
          await activeService.getActiveConversationId({
            studentId
          });
      }
    }

    // Ask Leo using the previous conversation context.
    const result = await askSmartStars({
      message,
      studentId,
      conversationId: effectiveConversationId,
      sourceChannel: "website"
    });

    // Save the active conversation for both platforms.
    if (isLocalDemo) {
      await activeService.setActiveConversationId({
        studentId,
        conversationId: result.conversation_id
      });
    }

    return res.status(200).json(result);

  } catch (error) {

    // Do not disclose whether another student
    // owns a requested conversation.
    if (
      error.message ===
      "Conversation not found for this student."
    ) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found."
      });
    }

    console.error("Chat API error:", error);

    return res.status(503).json({
      success: false,
      message: "Smart STARS Assistant is temporarily unavailable."
    });
  }
};

module.exports = { sendChatMessage };
