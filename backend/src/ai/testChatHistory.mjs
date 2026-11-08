
import "dotenv/config";
import assert from "node:assert/strict";

import { askSmartStars } from "../services/chatService.mjs";
import {
  getConversationMessages
} from "../services/conversationService.mjs";

import pool from "../config/db.js";

async function main() {
  const studentId = "DEMO001";
  let conversationId = null;

  try {
    console.log("===== FIRST MESSAGE =====");

    const first = await askSmartStars({
      message: "What is MH1810 and how many AUs is it?",
      studentId,
      sourceChannel: "website"
    });

    conversationId = first.conversation_id;

    assert.equal(first.success, true);
    assert.ok(Number.isSafeInteger(conversationId));

    console.log("Conversation ID:", conversationId);
    console.log("AI:", first.reply);

    console.log("\n===== FOLLOW-UP MESSAGE =====");

    const second = await askSmartStars({
      message:
        "Does that course have any prerequisites? " +
        "Please mention its course code.",
      studentId,
      conversationId,
      sourceChannel: "telegram"
    });

    assert.equal(second.success, true);
    assert.equal(second.conversation_id, conversationId);

    console.log("AI:", second.reply);

    console.log("\n===== SAVED HISTORY =====");

    const messages = await getConversationMessages({
      studentId,
      conversationId
    });

    assert.equal(messages.length, 4);

    assert.deepEqual(
      messages.map((message) => message.role),
      ["user", "assistant", "user", "assistant"]
    );

    assert.deepEqual(
      messages.map((message) => message.source_channel),
      ["website", "website", "telegram", "telegram"]
    );

    console.table(
      messages.map((message) => ({
        role: message.role,
        source: message.source_channel,
        content: message.content.slice(0, 100)
      }))
    );

    // Check that another student cannot access
    // this conversation through the chat service.
    await assert.rejects(
      () => askSmartStars({
        message: "Continue that conversation.",
        studentId: "OTHER_STUDENT",
        conversationId
      }),
      /Conversation not found/
    );

    console.log("\nPASS: Conversation history persisted");
    console.log("PASS: Website/Telegram channel labels stored");
    console.log("PASS: Conversation ownership enforced");

    if (second.reply.includes("MH1810")) {
      console.log("PASS: AI identified follow-up course");
    } else {
      console.log(
        "REVIEW: Check whether AI understood 'that course'."
      );
    }

  } finally {
    // Clean up only this test conversation.
    if (conversationId !== null) {
      await pool.query(
        `DELETE FROM ai_conversation
         WHERE conversation_id = ? AND student_id = ?`,
        [conversationId, studentId]
      );

      console.log("Test conversation cleaned up.");
    }

    await pool.end();
  }
}

main().catch((error) => {
  console.error("Chat history test failed:", error);
  process.exitCode = 1;
});
