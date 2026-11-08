
import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "./smartStarsAgent.mjs";

const testCases = [
  {
    name: "Nonexistent course",
    question:
      "What is ZZ99999999? How many AUs does it have?",
    context: { studentId: "DEMO001" },
    expectedTool: "get_course_information"
  },
  {
    name: "Academic term without a planning request",
    question:
      "What is my selected timetable for AY2099-2100 Semester 1?",
    context: { studentId: "DEMO001" },
    expectedTool: "get_student_timetable"
  },
  {
    name: "Missing student identity",
    question:
      "What is my selected timetable for AY2026-2027 Semester 1?",
    context: {},
    expectedTool: "get_student_timetable"
  }
];

async function main() {
  let toolChecksPassed = 0;

  for (const test of testCases) {
    console.log("\n================================");
    console.log("TEST:", test.name);
    console.log("QUESTION:", test.question);

    const result = await run(
      smartStarsAgent,
      test.question,
      {
        context: test.context,
        maxTurns: 10
      }
    );

    const toolsCalled = result.newItems
      .filter((item) => item.type === "tool_call_item")
      .map((item) => item.rawItem?.name)
      .filter(Boolean);

    console.log("\nTOOLS CALLED:");
    console.log(toolsCalled);

    console.log("\nAI RESPONSE:");
    console.log(result.finalOutput);

    const passed = toolsCalled.includes(test.expectedTool);

    console.log(
      "\nTOOL CHECK:",
      passed ? "PASS" : "FAIL"
    );

    if (passed) {
      toolChecksPassed++;
    }
  }

  console.log("\n===== SUMMARY =====");
  console.log(
    `Expected tool calls: ${toolChecksPassed}/${testCases.length}`
  );

  console.log(
    "Review the AI responses manually for correctness."
  );

  if (toolChecksPassed !== testCases.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("AI edge-case test failed:", error);
  process.exitCode = 1;
});
