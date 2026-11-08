
import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "./smartStarsAgent.mjs";

async function main() {
  const studentId = "DEMO001";

  const question = `
    I want to know about MH1811.

    1. What is the course name and how many AUs is it?
    2. Based on my academic record, am I eligible
       to take MH1811?
    3. Is MH1811 already included in my selected
       timetable for AY2026-2027 Semester 1?

    Please check all three using my Smart STARS data.

    Distinguish academic eligibility from actual
    registration and timetable selection.
  `;

  console.log("===== STUDENT QUESTION =====");
  console.log(question);

  const result = await run(
    smartStarsAgent,
    question,
    {
      context: {
        studentId
      },
      maxTurns: 10
    }
  );

  // Inspect the actual tool calls made by the agent.
  const toolCalls = result.newItems
    .filter((item) => item.type === "tool_call_item")
    .map((item) => item.rawItem?.name)
    .filter(Boolean);

  console.log("\n===== TOOLS CALLED =====");
  console.log(toolCalls);

  console.log("\n===== AI RESPONSE =====");
  console.log(result.finalOutput);

  // Verify that all required tools were called.
  const expectedTools = [
    "get_course_information",
    "check_course_eligibility",
    "get_student_timetable"
  ];

  console.log("\n===== TOOL VERIFICATION =====");

  let allPassed = true;

  for (const toolName of expectedTools) {
    const called = toolCalls.includes(toolName);

    console.log(
      `${called ? "PASS" : "FAIL"}: ${toolName}`
    );

    if (!called) {
      allPassed = false;
    }
  }

  console.log(
    `\nOverall tool execution: ${
      allPassed ? "PASS" : "FAIL"
    }`
  );

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Multi-tool test failed:", error);
  process.exitCode = 1;
});
