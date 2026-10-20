
import "dotenv/config";

import { run } from "@openai/agents";
import { smartStarsAgent } from "../ai/smartStarsAgent.mjs";

import {
  getConversationMessages,
  saveConversationTurn
} from "./conversationService.mjs";



// Shared chat service for website and Telegram.
export async function askSmartStars({
  message,
  studentId = null,
  conversationId = null,
  sourceChannel = "website"
}) {
  // 1. Validate message.
  if (typeof message !== "string") {
    throw new TypeError("Message must be a string.");
  }

  const cleanedMessage = message.trim();

  if (!cleanedMessage || cleanedMessage.length > 2000) {
    throw new TypeError(
      "Message must contain 1–2000 characters."
    );
  }

  // Student identity must come from a trusted caller.
  const trustedStudentId =
    typeof studentId === "string" && studentId.trim()
      ? studentId.trim()
      : null;

  if (conversationId !== null && !trustedStudentId) {
    throw new Error(
      "Authentication is required to access conversation history."
    );
  }

  if (
    conversationId !== null &&
    (!Number.isSafeInteger(conversationId) ||
      conversationId <= 0)
  ) {
    throw new TypeError("Invalid conversation ID.");
  }

  if (!["website", "telegram"].includes(sourceChannel)) {
    throw new TypeError("Invalid source channel.");
  }

  // 2. Retrieve previous messages, if continuing
  // an existing authenticated conversation.
  let previousMessages = [];

  if (conversationId !== null) {
    previousMessages = await getConversationMessages({
      studentId: trustedStudentId,
      conversationId,
      limit: 30
    });

    if (previousMessages === null) {
      throw new Error(
        "Conversation not found for this student."
      );
    }
  }

  // 3. Convert saved messages into AI input.
  const input = previousMessages.map((item) => ({
    role: item.role,
    content: [
      item.role === "assistant"
        ? { type: "output_text", text: item.content }
        : { type: "input_text", text: item.content }
    ]
  }));

  // Add the current student message.
  input.push({
    role: "user",
    content: [
      { type: "input_text", text: cleanedMessage }
    ]
  });

  // 4. Run our existing AI agent with history.
  const result = await run(
    smartStarsAgent,
    input,
    {
      context: {
        studentId: trustedStudentId
      },
      maxTurns: 10
    }
  );

  const reply = result.finalOutput;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error(
      "Smart STARS did not return a valid response."
    );
  }

  // 5. Keep unauthenticated chat stateless.
  // This preserves the existing local Chat API.
  if (!trustedStudentId) {
    return {
      success: true,
      reply: reply.trim()
    };
  }


  // 6. Save the complete conversation turn atomically.
  const saved = await saveConversationTurn({
    studentId: trustedStudentId,
    conversationId,
    title: cleanedMessage.slice(0, 100),
    userMessage: cleanedMessage,
    assistantMessage: reply.trim(),
    sourceChannel
  });
  // 7. Return the response and conversation ID.
  return {
    success: true,
    conversation_id: saved.conversation_id,
    reply: reply.trim()
  };
}
