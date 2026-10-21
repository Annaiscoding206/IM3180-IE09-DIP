# Smart STARS Companion

A local course-planning prototype with Course Explorer, academic eligibility,
Degree Audit, synthetic Programme Curriculum progress, saved preferences and
blocked periods, manual index management, ranked Plan A/B/C generation,
alternative-index suggestions, and validated final timetable selection.

Leo can retrieve the student's current academic/planning context, interpret a
preference draft, save it after explicit request-bound confirmation, and invoke
the same generator. The website and allowlisted Telegram demo share conversation
history. No official NTU integration or registration is performed.

- [Local environment, database migrations and verification](docs/SETUP.md)
- [Backend API contracts and examples](backend/docs/API.md)
- [Leo confirmation and planning integration](docs/LEO_PREFERENCE_INTEGRATION.md)

Backend: `cd backend && npm ci && npm start` (127.0.0.1:5001).
Frontend: `cd frontend && npm ci && npm run dev` (5173, API proxy to 5001).
Configure the ignored `backend/.env` using `.env.example` and the setup guide first.
Do not rerun the original schema/demo seeds against an existing database.

Run backend live regressions sequentially:

```sh
cd backend
RUN_MYSQL_TESTS=1 node --test --test-concurrency=1 tests/*.test.js
```

Frontend checks:

```sh
cd frontend
node --test tests/*.test.js
npm run build
```

Deterministic Leo tests substitute model output and use local MySQL; live
OpenAI/Telegram probes are separate and optional. Never commit `.env` or tokens.
