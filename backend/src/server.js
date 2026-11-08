require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const courseRoutes = require("./routes/courseRoutes");
const studentRoutes = require("./routes/studentRoutes");
const planRoutes = require("./routes/planRoutes");
const planningRequestRoutes = require("./routes/planningRequestRoutes");
const chatRoutes = require("./routes/chatRoutes");
const {
  localDemoChatIdentity
} = require("./middleware/localDemoChatIdentity");
const app = express();

// Middleware

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173"
    ]
  })
);
app.use(express.json());
app.use("/api/courses", courseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/planning-requests", planningRequestRoutes);
app.use("/api/chat", localDemoChatIdentity, chatRoutes);

// Test route
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Backend and database are connected",
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
