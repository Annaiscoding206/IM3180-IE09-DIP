require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const courseRoutes = require("./routes/courseRoutes");
const studentRoutes = require("./routes/studentRoutes");
const planRoutes = require("./routes/planRoutes");
const planningRequestRoutes = require("./routes/planningRequestRoutes");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/courses", courseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/planning-requests", planningRequestRoutes);

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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
