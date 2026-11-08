
import "dotenv/config";
import { run } from "@openai/agents";
import { smartStarsAgent } from "./smartStarsAgent.mjs";

async function main() {
  const studentId = "DEMO001";

  const now = new Date();

  const singaporeToday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    dateStyle: "full"
  }).format(now);

  const singaporeTomorrow = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    dateStyle: "full"
    }).format(
    new Date(now.getTime() + 24 * 60 * 60 * 1000)
    );

  const question = `
    Today in Singapore is ${singaporeToday}.
    Tomorrow is ${singaporeTomorrow}.

    Based on my selected weekly timetable,
    what classes are scheduled tomorrow?

    Include the course, session type,
    start/end time, and venue.
  `;


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
