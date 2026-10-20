
require("dotenv").config({ quiet: true });

const { setTimeout: sleep } = require("node:timers/promises");
const fs = require("node:fs/promises");
const path = require("node:path");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const APPROVED_TELEGRAM_USER_ID =
  process.env.TELEGRAM_DEMO_USER_ID?.trim();

const DEMO_STUDENT_ID = "DEMO001";
// Store the last processed Telegram update on the local machine.
const OFFSET_FILE = path.join(
  __dirname,
  "..",
  ".telegram-update-offset.json"
);

if (!/^[1-9]\d*$/.test(APPROVED_TELEGRAM_USER_ID || "")) {
  console.error("Missing or invalid TELEGRAM_DEMO_USER_ID.");
  process.exit(1);
}

if (!TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;


/**
 * Load the last saved Telegram polling offset.
 * If no checkpoint exists, start from 0.
 */
async function loadTelegramOffset() {
  try {
    const content = await fs.readFile(OFFSET_FILE, "utf8");
    const data = JSON.parse(content);

    if (
      !Number.isSafeInteger(data.offset) ||
      data.offset < 0
    ) {
      throw new Error("Invalid saved Telegram offset.");
    }

    return data.offset;
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }

    throw error;
  }
}

/**
 * Save the next Telegram offset.
 * Use a temporary file and rename it to reduce
 * the risk of an incomplete checkpoint write.
 */
async function saveTelegramOffset(offset) {
  const temporaryFile = `${OFFSET_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    JSON.stringify({ offset }, null, 2),
    "utf8"
  );

  await fs.rename(temporaryFile, OFFSET_FILE);
}

// Telegram Bot API helper
async function telegramRequest(method, payload = {}) {
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000)
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    // Avoid printing token-bearing request URLs.
    throw new Error(`Telegram ${method} request failed`);
  }

  return result.result;
}

// Send a text response to Telegram
async function sendMessage(chatId, text) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text
  });
}

// Handle incoming Telegram messages
async function handleMessage(message) {
  if (!message || message.chat?.type !== "private") {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text?.trim();

  // Identify the sender using Telegram's actual metadata.
  // Never trust a student ID provided in the message text.
  const telegramUserId = message.from?.id;

  const isApprovedUser =
    Number.isSafeInteger(telegramUserId) &&
    String(telegramUserId) === APPROVED_TELEGRAM_USER_ID;

  // Only the approved account gets the demo student context.
  const studentId = isApprovedUser
    ? DEMO_STUDENT_ID
    : null;

  // Step 16.1 — Show the sender's Telegram User ID.
  // The ID comes from Telegram metadata, not message text.
  if (text === "/whoami") {
    const telegramUserId = message.from?.id;

    if (!Number.isSafeInteger(telegramUserId)) {
      await sendMessage(
        chatId,
        "Unable to identify your Telegram account."
      );
      return;
    }

    await sendMessage(
      chatId,
      `Your Telegram User ID is: ${telegramUserId}\n\n` +
      "This ID can be used for the Smart STARS demo setup. " +
      "Your account is not linked yet."
    );

    return;
  }


  if (!text) {
    await sendMessage(
      chatId,
      "Please send a text message."
    );
    return;
  }

  if (text === "/start") {
    await sendMessage(
      chatId,
      "Hi! I'm Leo, your Smart STARS AI Assistant! 🌟\n\n" +
      "I can help you explore courses, understand academic " +
      "requirements, and plan your semester."
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      "Smart STARS Assistant commands:\n\n" +
      "/start - Welcome message\n" +
      "/help - Show available commands\n\n" +
      "AI course questions will be enabled in the next step."
    );
    return;
  }

  if (text.length > 2000) {
    await sendMessage(
      chatId,
      "Please keep your message under 2,000 characters."
    );
    return;
  }

  // Forward the Telegram message to the existing AI agent.
  // Student identity remains null until secure account linking.
  // Process Telegram messages using Leo Assistant.
  try {
    const { askSmartStars } = await import(
      "../src/services/chatService.mjs"
    );

    const {
      getActiveConversationId,
      setActiveConversationId
    } = await import(
      "../src/services/conversationService.mjs"
    );

    console.log("Leo is processing a Telegram question...");

    // 1. Load the active conversation from MySQL.
    const conversationId =
      studentId === DEMO_STUDENT_ID
        ? await getActiveConversationId({ studentId })
        : null;

    // 2. Ask Leo using the existing conversation.
    const result = await askSmartStars({
      message: text,
      studentId,
      conversationId,
      sourceChannel: "telegram"
    });

    // 3. Save the active conversation in MySQL.
    if (studentId === DEMO_STUDENT_ID) {
      if (!Number.isSafeInteger(result.conversation_id)) {
        throw new Error("Invalid AI conversation ID.");
      }

      await setActiveConversationId({
        studentId,
        conversationId: result.conversation_id
      });

      console.log("Leo's active conversation saved in MySQL.");
    }

    // 4. Send Leo's reply to Telegram.
    const reply = result.reply.trim();

    const safeReply =
      reply.length > 4000
        ? reply.slice(0, 3950) + "\n\n[Response shortened]"
        : reply;

    await sendMessage(chatId, safeReply);

    console.log("Leo sent an AI response to Telegram.");

  } catch (error) {
    console.error(
      "Telegram AI processing failed:",
      error.message
    );

    await sendMessage(
      chatId,
      "Sorry, Leo couldn't process your question right now. " +
      "Please try again shortly."
    );
  }
}

// Continuously receive Telegram updates
async function main() {
  console.log("Starting Smart STARS Telegram bot...");

  const bot = await telegramRequest("getMe");

  console.log(`Connected to @${bot.username}`);
  console.log("Waiting for Telegram messages...");
  console.log("Press Ctrl+C to stop.\n");

  // Resume from the last saved Telegram update.
  let offset = await loadTelegramOffset();

  console.log(
    `Resuming Telegram polling from offset ${offset}.`
  );

  while (true) {
    try {
      const updates = await telegramRequest("getUpdates", {
        offset,
        timeout: 25,
        limit: 20,
        allowed_updates: ["message"]
      });

      for (const update of updates) {
        // 1. Process the Telegram message.
        await handleMessage(update.message);

        // 2. Calculate the next update to request.
        const nextOffset = update.update_id + 1;

        if (
          !Number.isSafeInteger(nextOffset) ||
          nextOffset < 0
        ) {
          throw new Error("Invalid Telegram update ID.");
        }

        // 3. Save the checkpoint BEFORE advancing
        // the in-memory offset.
        await saveTelegramOffset(nextOffset);

        offset = nextOffset;

        console.log(
          `Telegram update ${update.update_id} checkpoint saved.`
        );
      }

    } catch (error) {
      console.error(
        "Telegram polling/processing error:",
        error.message
      );

      // Retry without advancing past an update that
      // failed to finish processing or checkpointing.
      await sleep(3000);
    }
  }

}

main().catch((error) => {
  console.error("Telegram bot startup failed:", error.message);
  process.exitCode = 1;
});
