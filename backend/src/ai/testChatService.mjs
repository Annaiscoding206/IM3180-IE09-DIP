
import "dotenv/config";

import { askSmartStars } from "../services/chatService.mjs";

async function main() {
  const message =
    "What is MH1810 and how many AUs does it have?";

  console.log("===== STUDENT MESSAGE =====");
  console.log(message);

  const response = await askSmartStars({
    message,
    studentId: "DEMO001"
  });

  console.log("\n===== CHAT SERVICE RESPONSE =====");
  console.log(response);
}

main().catch((error) => {
  console.error("Chat service test failed:", error);
  process.exitCode = 1;
});
