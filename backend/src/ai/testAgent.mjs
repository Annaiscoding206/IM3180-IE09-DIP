
import "dotenv/config";
import { Agent, run } from "@openai/agents";

// Verify that the API key is loaded.
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

// Create the Smart STARS AI Agent.
const smartStarsAgent = new Agent({
  name: "Smart STARS Assistant",
  model: "gpt-4.1-mini",

  instructions: `
    You are Smart STARS, a friendly academic
    planning assistant for NTU students.

    Your responsibilities include:
    - Helping students understand course information.
    - Answering questions about their timetable.
    - Explaining course eligibility.
    - Supporting academic planning.

    You are not connected to student data yet.
    Never invent student-specific information.

    Keep your answers clear and concise.
  `,
});

// Test the agent.
async function main() {
  console.log("Testing Smart STARS AI Agent...\n");

  const result = await run(
    smartStarsAgent,
    "Hi! Introduce yourself and explain how you can help me."
  );

  console.log("===== AI RESPONSE =====");
  console.log(result.finalOutput);
}

main().catch((error) => {
  console.error("AI test failed:", error.message);
  process.exitCode = 1;
});
