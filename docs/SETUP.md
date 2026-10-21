# Local setup and verification

Use Node.js compatible with the checked-in Vite 8 dependency (Node 22.12+ or supported newer LTS) and MySQL 8 with enforced CHECK constraints. Commands below assume the repository root unless a `cd` is shown. On Windows, `npm.cmd` can replace `npm`.

## Environment

Install locked dependencies with `npm ci` separately in `backend` and `frontend`. Copy `backend/.env.example` to `backend/.env` and fill in your local credentials. Do not overwrite an existing configured `.env`. The file is ignored; never add credentials to source or browser bundles.

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT` | Local MySQL host/port (usually 127.0.0.1 / 3306) |
| `DB_USER`, `DB_PASSWORD` | Local database credentials |
| `DB_NAME` | `stars_companion_db`; setup scripts check this name |
| `PORT` | Backend port, default **5001** |
| `NODE_ENV` | `development` for local demo; production disables local identity/chat |
| `DEMO_PLANNING_ENABLED` | Exact `true` opts local requests into trusted demo identity DEMO001 |
| `DEMO_CHAT_ENABLED` | Exact `true` opts local website chat into the same demo identity/history |
| `OPENAI_API_KEY` | Only needed for real natural-language Leo/model calls |
| `OPENAI_AGENTS_DISABLE_TRACING` | Set to `1` to disable SDK trace export during local deterministic verification |
| `TELEGRAM_BOT_TOKEN` | Only needed when intentionally running the Telegram bot |
| `TELEGRAM_DEMO_USER_ID` | Single allowlisted Telegram sender mapped to DEMO001; never use a chat message as identity |
| `RUN_MYSQL_TESTS` | Test-only: `1` enables isolated live database/HTTP suites |

The agent currently configures `gpt-4.1-mini` in code, not an environment-selected model. General Leo requests call OpenAI and may incur usage. Exact recognized confirmation/generation commands bypass the model. The deterministic test suite does not need an OpenAI key or a Telegram token.

Backend listens on `127.0.0.1:5001`. Frontend development uses port 5173 and proxies `/api` to `http://127.0.0.1:5001` in `frontend/vite.config.js`. CORS and demo Origin checks allow the documented local frontend origins. Keep port 5173 available: Vite moving to 5174 will fail those checks. If intentionally changing ports, update the proxy, CORS and demo-origin configuration together. Vite build/preview does not provide a production API reverse proxy.

## Existing database: inspect before applying extensions

Do **not** rerun `01_schema.sql`, `02_course_data.sql` or `03_demo_data.sql` against your populated database. Do not reset existing plans/history. Connect using your local MySQL client with an interactive password prompt (not a password embedded in shell history), select `stars_companion_db`, and inspect:

```sql
SELECT DATABASE();
SHOW TABLES;
SHOW COLUMNS FROM student;
SHOW CREATE TABLE academic_record;
SHOW CREATE TABLE planning_blocked_period;
```

Extension inventory / setup order:

| File or command | Purpose and repeatability |
|---|---|
| `05_course_types.sql` / `node scripts/applyCourseTypes.cjs` from backend | `course_type` plus idempotent catalogue type mappings |
| `07_planning_blocked_period.sql` | `CREATE TABLE IF NOT EXISTS` day-specific blocks; no seed changes |
| `node scripts/setupDegreeAudit.cjs --migration-only` from backend | Extension 08; preserves legacy completed rows as PASSED records with unknown historical fields left null; rerun imports only missing legacy keys |
| `node scripts/setupDegreeAudit.cjs` | Also applies repeatable synthetic attempts from 09 JSON using the shared importer/invalidation service |
| `node scripts/setupCurriculum.cjs --migration-only` | Extension 10: admission fields plus curriculum tables |
| `node scripts/setupCurriculum.cjs` | Also applies synthetic 11 JSON, sets explicit demo admission data, refuses to overwrite conflicting existing seed/profile values |
| `node scripts/setupLeo.cjs` | Inspects and creates only missing AI tables from 05 chat history, 06 active conversation and 12 preference draft; prints applied/existing tables |

The two different files beginning `05_` are separate extensions. Never apply all numbered SQL files blindly. SQL files can be applied with the MySQL client's `SOURCE /absolute/path/to/file.sql`; the setup commands above use `backend/.env` instead. Use the Degree Audit/Curriculum setup scripts rather than translating JSON into ad hoc SQL.

`04_week8_demo_data.sql` is optional historical demo content. It is not a migration needed for Task 8 and should not be rerun just to enable Leo. `database/legacy` and `migrate_course_data.sql` are historical/import utilities, not part of this setup sequence.

All seeded academic/curriculum records are clearly synthetic prototype data. `completed_course` remains preserved for backward compatibility; `academic_record` PASSED attempts are the authoritative runtime completion source. New academic imports/profile changes should use existing service writers to invalidate plans with student/request/plan lock ordering. Do not alter eligibility-affecting data via arbitrary SQL during normal use.

## Fresh empty database only

For a genuinely new local installation, run these **once**, in order, through MySQL:

1. `database/01_schema.sql`
2. `database/02_course_data.sql`
3. `database/03_demo_data.sql`

Then apply course types (05), blocked periods (07, safe if base already includes it), Degree Audit setup (08/09), Curriculum setup (10/11), and Leo setup (05 AI/06/12) in the order above. Base schema already includes the current non-AI planning/audit/curriculum tables, but extension scripts also handle legacy-record conversion and repeatable demo population. AI tables are installed separately by `setupLeo.cjs` even for fresh databases.

## Start locally

Backend terminal:

```sh
cd backend
npm ci
npm start
```

Frontend terminal:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Check `http://127.0.0.1:5001/api/health`, then open `http://127.0.0.1:5173`. With local planning demo enabled, the Planner saves preferences/blocked periods, generates up to three ranked alternatives, preserves explicit source locks, and validates/selects a final timetable. Reload uses the currently valid active selection. Open Preferences and blocked periods to edit exact time ranges; calendar red hours are a visual approximation, while backend validation uses exact times. Old browser-only blocks/locks are not automatically imported into shared request data; review and save them again through the Planner.

Optional Telegram run (makes external Telegram/OpenAI calls):

```sh
cd backend
node scripts/telegramBot.cjs
```

Only the allowlisted user gets demo academic/planning access. Website and that user's Telegram messages share `ai_active_conversation`, and source channels are stored on messages. The ignored `.telegram-update-offset.json` is a local polling checkpoint. Do not run the bot as part of deterministic regression tests.

## Verification

Run integration suites sequentially because they share the local MySQL database:

```sh
cd backend
RUN_MYSQL_TESTS=1 node --test --test-concurrency=1 tests/*.test.js
```

The suites create uniquely named fixtures and clean up their own rows; MySQL and migrations must already exist. Without `RUN_MYSQL_TESTS=1`, live suites skip. Existing `src/ai/test*.mjs` and `scripts/testChatHttp.cjs` are separate manual/real-model probes; they are not included in the deterministic glob.

Frontend adapter tests and production build:

```sh
cd frontend
node --test tests/*.test.js
npm run build
```

Task 8 tests exercise all five requested flows over local MySQL/HTTP, SDK tool invocation with trusted context, draft confirmation/rollback, shared website/Telegram history, structured failures and active selection. The model runner is substituted; no real OpenAI/Telegram delivery is claimed. Frontend tests cover API adapters; a production build checks the React bundle. These checks do not replace an interactive browser acceptance pass.

See [API contracts](../backend/docs/API.md) and [Leo handoff](LEO_PREFERENCE_INTEGRATION.md).
