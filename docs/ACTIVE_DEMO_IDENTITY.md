# Active demo identity

`DEMO_PLANNING_STUDENT_ID` is the only active demo student mapping. The default is
DEMO001 when the variable is absent. An explicitly empty, unrecognised or
non-allowlisted value is invalid. The shared resolver in planningIdentity.js
also queries student existence on every resolution. Failure returns a safe 503
DEMO_IDENTITY_UNAVAILABLE in HTTP middleware, without guessing another account.
No records or programme mappings are changed by switching modes.

From backend, run either:

```sh
DEMO_PLANNING_ENABLED=true DEMO_CHAT_ENABLED=true DEMO_PLANNING_STUDENT_ID=DEMO001 npm start
DEMO_PLANNING_ENABLED=true DEMO_CHAT_ENABLED=true DEMO_PLANNING_STUDENT_ID=DEMO002 npm start
```

Run one backend at a time. Stop/restart it and reload the browser when switching.
An already-open page does not perform a live account switch. Do not run the
DEMO002 setup again to switch accounts: it is independent of active identity.
This supersedes older DEMO001-only descriptions in the general setup guide.

## Request flow

1. Planning/student/catalogue middleware resolves the trusted server identity or
   the validated local demo fallback. Existing loopback, non-production and
   Origin checks remain enforced. Trusted authentication is never overwritten.
2. `GET /api/students/current` returns `{success:true,data:{student_id:...}}`.
   Client IDs in queries, bodies and headers cannot choose that identity.
3. The browser waits for this bootstrap before mounting student-scoped content.
   Failure shows a retry action; malformed responses never become DEMO001.
   A keyed application subtree prevents old plan/profile/chat state being reused
   if bootstrap mounts another identity. The existing async cancellation guards
   protect profile and planning responses.
4. All shell student reads and request creation use the resolved ID. Course
   annotations, eligibility, profile, audit and curriculum use existing APIs;
   request and plan ownership remain server-enforced.
5. Website Leo uses the same resolver, gated by DEMO_CHAT_ENABLED. Its active
   conversation and all tools are scoped to the resulting trusted student ID.
   Disabling chat's opt-in does not sign it into a different student: existing
   anonymous chat behaviour remains, without access to student history.

## Telegram

Telegram's sender authentication remains separate: only the numeric sender ID
configured in TELEGRAM_DEMO_USER_ID may use the demo student context, and only
private chats are handled. That authenticated demo sender now resolves the same
DEMO_PLANNING_STUDENT_ID; message text never selects a student. Other senders keep
the existing anonymous behaviour and cannot read student conversations/plans.
Website/Telegram message provenance, active conversation pointers and shared
history are unchanged. Restart the bot with the same environment as the backend,
for example `DEMO_PLANNING_STUDENT_ID=DEMO002 node scripts/telegramBot.cjs`.
Do not assume a shell override applied to npm start also configures another process.

## Repository hardcoding audit

| Occurrences | Classification / action |
|---|---|
| frontend/src/main.jsx STUDENT_ID constant and its profile/request/eligibility callers | Runtime default removed; bootstrap supplies studentId. Planner receives owned request/plan context. |
| backend/src/middleware/planningIdentity.js | Sole legitimate default and allowlist; shared resolver validates existence. |
| backend/src/middleware/localDemoChatIdentity.js | Independent runtime default removed; trusted identity is preserved, demo fallback uses shared resolver. |
| backend/src/controllers/chatController.js | DEMO001-only shared-history condition removed; applies to the identity validated by local demo chat middleware. |
| backend/scripts/telegramBot.cjs | Independent runtime student constant removed; approved sender uses shared resolver. |
| database/03_demo_data.sql, 09_degree_audit_demo_data.json, 11_programme_curriculum_demo_data.json, demo002_profile.json | Legitimate historical/demo seed identity. Unchanged. |
| backend/scripts/setupDemo002.cjs | Legitimate guard protecting DEMO001's seed; not an active-account selector. |
| backend/tests and frontend/tests | Expected seed identities, ownership attack inputs and regression fixture values; retained, with async bootstrap fixtures updated. |
| backend/src/ai/test*.mjs and backend/scripts/testChatHttp.cjs | Standalone manual test scripts, not application runtime. Their explicit fixture IDs remain; scripts assuming DEMO001 should be run in that mode. |
| docs/database_schema.md, API examples, CATALOGUE_IMPORT.md | Historical examples or record-specific documentation, not runtime selectors. |
| docs/DEMO002.md, LEO_PREFERENCE_INTEGRATION.md, backend/docs/API.md | Updated active-identity workflow. Existing uncommitted catalogue edits in docs/SETUP.md were preserved. |

StudentProfile and API helpers accept a caller-supplied studentId as a resource
identifier, not authentication. The application shell now supplies only the
server-resolved identity. Leo tools obtain studentId from trusted run context;
none default to a demo student or accept a model-selected identity.

## Verification

The identity integration test exercises both existing demo students over real
HTTP routes, real academic/curriculum APIs, owned temporary plans, and shared
website/Telegram conversation fixtures. The model runner is stubbed for tool
context assertions; a deterministic history question exercises the actual chat
controller without external AI calls. Cross-student profile, request, plan,
catalogue context and conversation requests are rejected. Temporary data and
active conversation pointers are restored, with full database row fingerprints
checked. Frontend tests exercise the real shell, Planner, StudentProfile and
ChatWidget for both modes, plus bootstrap loading/error/retry and export routing.
Live Telegram delivery and model-generated language are not part of these tests.
