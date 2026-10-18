
import "dotenv/config";
import assert from "node:assert/strict";

import {
  createConversation,
  saveMessage,
  getConversationMessages,
  listConversations
} from "../services/conversationService.mjs";

import pool from "../config/db.js";

async function main() {
  const studentId = "DEMO001";
  let conversationId = null;

  try {
    // 1. Create conversation.
    const conversation = await createConversation({
      studentId,
      title: "Conversation Service Test"
    });

    conversationId = conversation.conversation_id;

    console.log(
      "Created conversation:",
      conversationId
    );

    // 2. Save student message.
    await saveMessage({
      studentId,
      conversationId,
      role: "user",
      content: "What is MH1810?",
      sourceChannel: "website"
    });

    // 3. Save AI response.
    await saveMessage({
      studentId,
      conversationId,
      role: "assistant",
      content: "MH1810 is Mathematics 1, worth 3 AUs.",
      sourceChannel: "website"
    });

    // 4. Retrieve messages.
    const messages = await getConversationMessages({
      studentId,
      conversationId
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");

    console.log("PASS: Messages saved and retrieved");
    console.table(messages);

    // 5. Test conversation ownership.
    const unauthorized = await getConversationMessages({
      studentId: "ANOTHER_STUDENT",
      conversationId
    });

    assert.equal(unauthorized, null);

    console.log("PASS: Conversation ownership enforced");

    // 6. Test conversation listing.
    const conversations = await listConversations({
      studentId
    });

    assert.ok(
      conversations.some(
        (item) => item.conversation_id === conversationId
      )
    );

    console.log("PASS: Conversation listing");

    console.log("\nAll conversation service tests passed!");

  } finally {
    // Remove only the test conversation created here.
    // Its two messages are deleted automatically by FK cascade.
    if (conversationId !== null) {
      await pool.query(
        `
        DELETE FROM ai_conversation
        WHERE conversation_id = ?
          AND student_id = ?
        `,
        [conversationId, studentId]
      );

      console.log("Test conversation cleaned up.");
    }

    await pool.end();
  }
}

main().catch((error) => {
  console.error("Conversation service test failed:", error);
  process.exitCode = 1;
});
