
import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "./smartStarsAgent.mjs";

async function main() {
  const studentId = "DEMO001";

  const question =
    "Based on my academic record, am I eligible " +
    "to take MH1811? Explain the eligibility checks.";

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
