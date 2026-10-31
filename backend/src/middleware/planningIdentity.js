const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// One server-controlled demo mapping for planning, website Leo and Telegram.
// Resolve on every request so a missing student never becomes an anonymous user.
async function resolveDemoStudentId(db = require("../config/db")) {
  const studentId = process.env.DEMO_PLANNING_STUDENT_ID ?? "DEMO001";
  if (!["DEMO001", "DEMO002"].includes(studentId)) throw new Error("Invalid active demo student configuration");
  const [students] = await db.query("SELECT student_id FROM student WHERE student_id = ?", [studentId]);
  if (students.length !== 1) throw new Error("Configured demo student does not exist");
  return students[0].student_id;
}

async function resolveIdentity(req, res, next, optional) {
  // Reuse a trusted identity supplied by server middleware. Never accept a
  // student_id from headers, query parameters or JSON as authentication.
  if (typeof res.locals.authenticatedStudentId === "string" && res.locals.authenticatedStudentId.trim()) return next();

  const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173",
    `http://localhost:${process.env.PORT || 5001}`, `http://127.0.0.1:${process.env.PORT || 5001}`]);
  if (req.headers.origin && !origins.has(req.headers.origin)) {
    if (optional) return next();
    return res.status(403).json({ success: false, message: "Planning demo access is restricted to local origins" });
  }
  // Explicit local prototype opt-in, independent of Leo/chat configuration.
  if (process.env.DEMO_PLANNING_ENABLED === "true" && process.env.NODE_ENV !== "production" && LOCAL.has(req.socket.remoteAddress)) {
    try {
      res.locals.authenticatedStudentId = await resolveDemoStudentId();
    } catch {
      return res.status(503).json({ success: false, code: "DEMO_IDENTITY_UNAVAILABLE", message: "Active demo student is unavailable; check server configuration and student setup" });
    }
    return next();
  }
  if (optional) return next();
  return res.status(401).json({ success: false, message: "Student identity required" });
}

const planningIdentity = (req, res, next) => resolveIdentity(req, res, next, false);
// Public catalogue remains available anonymously; completion annotations are
// added only for an existing trusted identity or the same opt-in local demo.
const optionalPlanningIdentity = (req, res, next) => resolveIdentity(req, res, next, true);
module.exports = { planningIdentity, optionalPlanningIdentity, resolveDemoStudentId };
