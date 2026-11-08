
import "dotenv/config";
import assert from "node:assert/strict";

import { loadCourseInformation } from "./tools/courseTools.mjs";
import { loadCourseEligibility } from "./tools/eligibilityTools.mjs";
import { loadSelectedTimetable } from "./tools/timetableTools.mjs";
import pool from "../config/db.js";

const tests = [
  {
    name: "Valid course information",
    async check() {
      const result = await loadCourseInformation("MH1810");

      assert.equal(result.status, "ok");
      assert.equal(result.data.course_name, "Mathematics 1");
      assert.equal(result.data.au, 3);
      assert.equal("indexes" in result.data, false);
    }
  },

  {
    name: "Course indexes included when requested",
    async check() {
      const result = await loadCourseInformation(
        "MH1810",
        true
      );

      assert.equal(result.status, "ok");
      assert.ok(Array.isArray(result.data.indexes));
      assert.ok(result.data.indexes.length > 0);
    }
  },

  {
    name: "Invalid course code",
    async check() {
      const result = await loadCourseInformation("MH1810!");

      assert.equal(result.status, "invalid_course_code");
    }
  },

  {
    name: "Nonexistent course",
    async check() {
      const result = await loadCourseInformation(
        "ZZ99999999"
      );

      assert.equal(result.status, "not_found");
    }
  },

  {
    name: "Missing student identity for eligibility",
    async check() {
      const result = await loadCourseEligibility(
        null,
        "MH1811"
      );

      assert.equal(
        result.status,
        "authentication_required"
      );
    }
  },

  {
    name: "Valid academic eligibility",
    async check() {
      const result = await loadCourseEligibility(
        "DEMO001",
        "MH1811"
      );

      assert.equal(result.status, "ok");
      assert.equal(result.data.eligible, true);
      assert.equal(result.data.can_select, true);

      const requirements =
        result.data.recorded_course_requirements;

      assert.deepEqual(requirements.prerequisites, []);

      assert.ok(
        requirements.corequisites.some(
          (item) => item.course_code === "MH1810"
        )
      );
    }
  },

  {
    name: "Invalid planning request ID",
    async check() {
      const result = await loadCourseEligibility(
        "DEMO001",
        "MH1811",
        -1
      );

      assert.equal(result.status, "invalid_request_id");
    }
  },

  {
    name: "Missing student identity for timetable",
    async check() {
      const result = await loadSelectedTimetable(null);

      assert.equal(
        result.status,
        "authentication_required"
      );
    }
  },

  {
    name: "Semester with no planning request",
    async check() {
      const result = await loadSelectedTimetable(
        "DEMO001",
        "2099-2100",
        1
      );

      assert.equal(result.status, "no_planning_request");
    }
  },

  {
    name: "Valid selected timetable",
    async check() {
      const result = await loadSelectedTimetable(
        "DEMO001",
        "2026-2027",
        1
      );

      assert.ok(
        ["ok", "incomplete"].includes(result.status)
      );

      assert.ok(Array.isArray(result.sessions));
      assert.ok(result.sessions.length > 0);
    }
  },

  {
    name: "Backend API connection failure",
    async check() {
      const originalFetch = globalThis.fetch;

      try {
        // Simulate an unavailable API only in this
        // test process. No real server is stopped.
        globalThis.fetch = async () => {
          throw new Error("SIMULATED_API_FAILURE");
        };

        await assert.rejects(
          () => loadCourseInformation("MH1810"),
          /SIMULATED_API_FAILURE/
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  }
];

async function main() {
  let passed = 0;
  let failed = 0;

  try {
    console.log("===== SMART STARS EDGE-CASE TESTS =====");

    for (const test of tests) {
      try {
        await test.check();

        console.log(`PASS: ${test.name}`);
        passed++;
      } catch (error) {
        console.error(`FAIL: ${test.name}`);
        console.error(`  ${error.message}`);
        failed++;
      }
    }

    console.log("\n===== TEST SUMMARY =====");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${tests.length}`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Test runner failed:", error);
  process.exitCode = 1;
});
