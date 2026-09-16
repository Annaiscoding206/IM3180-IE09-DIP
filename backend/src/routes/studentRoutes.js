const express = require("express");

const {
  getStudentById,
} = require("../controllers/studentController");

const router = express.Router();

// GET /api/students/:studentId
router.get("/:studentId", getStudentById);

module.exports = router;