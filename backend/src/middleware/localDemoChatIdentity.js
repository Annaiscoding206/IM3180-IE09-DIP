
const LOCAL_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1"
]);

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5000",
  "http://localhost:5000"
]);

function localDemoChatIdentity(req, res, next) {
  const isDemoEnabled =
    process.env.DEMO_CHAT_ENABLED === "true";

  const isDevelopment =
    process.env.NODE_ENV !== "production";

  const isLocalRequest =
    LOCAL_ADDRESSES.has(req.socket.remoteAddress);

  const origin = req.headers.origin;

  const isAllowedOrigin =
    !origin || ALLOWED_ORIGINS.has(origin);
  // Reject requests originating from unapproved websites.
  // Do not allow them to invoke the AI agent.
  if (!isAllowedOrigin) {
    return res.status(403).json({
      success: false,
      message: "Chat access is restricted to the local Smart STARS demo."
    });
  }


  // This is only a controlled local demo identity,
  // NOT real student authentication.
  if (
    isDemoEnabled &&
    isDevelopment &&
    isLocalRequest &&
    isAllowedOrigin
  ) {
    res.locals.authenticatedStudentId = "DEMO001";
    res.locals.isLocalDemoChat = true;
  }

  next();
}

module.exports = { localDemoChatIdentity };
