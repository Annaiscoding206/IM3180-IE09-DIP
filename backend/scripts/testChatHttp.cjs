
require("dotenv").config();

const assert = require("node:assert/strict");
const express = require("express");

const pool = require("../src/config/db");
const chatRoutes = require("../src/routes/chatRoutes");

// Start an isolated server with a fixed,
// server-side test identity.
function startTestServer(studentId = null) {
  const app = express();

  app.use(express.json());

  if (studentId !== null) {
    app.use((req, res, next) => {
      res.locals.authenticatedStudentId = studentId;
      next();
    });
  }

  app.use("/api/chat", chatRoutes);

  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        baseUrl:
          `http://127.0.0.1:${server.address().port}`
      });
    });

    server.once("error", reject);
  });
}

// Send HTTP requests and return parsed JSON.
async function request(baseUrl, path, body = undefined) {
  const response = await fetch(baseUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json"
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) })
  });

  return {
    status: response.status,
    data: await response.json()
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) =>
      error ? reject(error) : resolve()
    );
  });
}

async function main() {
  // Never run the simulated identity servers in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "This test must not run in production."
    );
  }

  const studentId = "DEMO001";
  const servers = [];
  let conversationId = null;

  try {
    // These are separate loopback-only test servers.
    // Identity is fixed internally, never read from
    // a request body or header.
    const student = await startTestServer(studentId);
    servers.push(student);

    const other = await startTestServer("OTHER_STUDENT");
    servers.push(other);

    const anonymous = await startTestServer();
    servers.push(anonymous);

    // TEST 1: Start an authenticated conversation.
    console.log("\nTEST 1: Create conversation");

    const first = await request(
      student.baseUrl,
      "/api/chat",
      {
        message:
          "What is MH1810 and how many AUs does it have?"
      }
    );

    assert.equal(first.status, 200);
    assert.equal(first.data.success, true);

    conversationId = first.data.conversation_id;

    assert.ok(Number.isSafeInteger(conversationId));

    console.log("Conversation ID:", conversationId);
    console.log("AI:", first.data.reply);
    console.log("PASS: Conversation created through HTTP");

    // TEST 2: Continue the conversation.
    console.log("\nTEST 2: Follow-up question");

    const second = await request(
      student.baseUrl,
      "/api/chat",
      {
        conversationId,
        message:
          "Does that course have prerequisites? " +
          "Please mention its course code."
      }
    );

    assert.equal(second.status, 200);
    assert.equal(second.data.success, true);
    assert.equal(
      second.data.conversation_id,
      conversationId
    );

    assert.match(second.data.reply, /MH1810/i);

    console.log("AI:", second.data.reply);
    console.log("PASS: AI remembered the course");

    // TEST 3: Retrieve stored messages.
    console.log("\nTEST 3: Retrieve conversation history");

    const history = await request(
      student.baseUrl,
      `/api/chat/conversations/${conversationId}/messages`
    );

    assert.equal(history.status, 200);
    assert.equal(history.data.count, 4);

    assert.deepEqual(
      history.data.data.map((item) => item.role),
      ["user", "assistant", "user", "assistant"]
    );

    console.log("PASS: Four messages retrieved");

    // TEST 4: List student's conversations.
    console.log("\nTEST 4: List conversations");

    const list = await request(
      student.baseUrl,
      "/api/chat/conversations"
    );

    assert.equal(list.status, 200);

    assert.ok(
      list.data.data.some(
        (item) =>
          Number(item.conversation_id) === conversationId
      )
    );

    console.log("PASS: Conversation appears in list");

    // TEST 5: A different student cannot read history.
    console.log("\nTEST 5: Cross-student access");

    const unauthorizedRead = await request(
      other.baseUrl,
      `/api/chat/conversations/${conversationId}/messages`
    );

    assert.equal(unauthorizedRead.status, 404);

    console.log("PASS: Cross-student read blocked");

    // TEST 6: Body studentId cannot override
    // the identity fixed by the test middleware.
    console.log("\nTEST 6: Student ID spoofing");

    const unauthorizedContinue = await request(
      other.baseUrl,
      "/api/chat",
      {
        studentId: "DEMO001",
        conversationId,
        message: "Continue this conversation."
      }
    );

    assert.equal(unauthorizedContinue.status, 404);

    console.log("PASS: Student ID spoofing blocked");

    // TEST 7: Anonymous access to history.
    console.log("\nTEST 7: Anonymous access");

    const anonymousHistory = await request(
      anonymous.baseUrl,
      "/api/chat/conversations"
    );

    assert.equal(anonymousHistory.status, 401);

    console.log("PASS: Authentication required");

    console.log(
      "\n===== ALL 7 HTTP TESTS PASSED ====="
    );

  } finally {
    // Remove only the conversation made by this test.
    try {
      if (conversationId !== null) {
        await pool.query(
          `DELETE FROM ai_conversation
           WHERE conversation_id = ?
             AND student_id = ?`,
          [conversationId, studentId]
        );

        console.log("Test conversation cleaned up.");
      }
    } finally {
      for (const item of servers) {
        await closeServer(item.server);
      }

      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error("HTTP integration test failed:", error);
  process.exitCode = 1;
});
