
const express = require("express");

const {
  sendChatMessage
} = require("../controllers/chatController");

const {
  getChatConversations,
  getChatMessages,
  getActiveChat
} = require("../controllers/chatHistoryController");

const router = express.Router();

// Send message to AI.
router.post("/", sendChatMessage);
router.get("/active", getActiveChat);
// Retrieve authenticated student's conversations.
router.get("/conversations", getChatConversations);

// Retrieve messages from an owned conversation.
router.get(
  "/conversations/:conversationId/messages",
  getChatMessages
);

module.exports = router;
