
import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "./smartStarsAgent.mjs";

async function main() {
  const studentId = "DEMO001";

  const question =
    "What is MH1810, how many AUs does it have, " +
    "and what are its listed prerequisites?";

  console.log("===== STUDENT QUESTION =====");
  console.log(question);

  const result = await run(
    smartStarsAgent,
    question,
    {
      context: {
        studentId
      }
    }
  );

  console.log("\n===== AI RESPONSE =====");
  console.log(result.finalOutput);
}

main().catch((error) => {
  console.error("AI test failed:", error.message);
  process.exitCode = 1;
});
