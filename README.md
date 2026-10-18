# Smart STARS Companion

A course-planning companion for exploring courses, checking academic eligibility,
and preparing semester plans before official registration in STARS.

## Course Explorer frontend

The current frontend implementation is a React/Vite Course Explorer connected
to the existing Express/MySQL API. It reads courses, indexes, timetable slots,
the demo student's completed courses, eligibility results, and the latest
planning request from the project database. It includes:

- course search and filtering;
- eligibility and completion-status labels;
- course details with database indexes and timetable slots;
- add/remove course interactions;
- selected AU and course summaries; and
- responsive desktop and mobile layouts.

Set up the database by running `database/01_schema.sql`,
`database/02_course_data.sql`, `database/03_demo_data.sql`, and
`database/05_course_types.sql` in that order, then create `backend/.env` as
described in `backend/docs/API.md`. The last script is idempotent and also
upgrades databases created before course-type filtering was added.

Start the backend in one PowerShell window:

```powershell
cd backend
npm install
npm.cmd start
```

Start the frontend in a second PowerShell window:

```powershell
cd frontend
npm install
npm.cmd run dev
```

Create a production build:

```powershell
cd frontend
npm.cmd run build
```

The Vite development server proxies `/api` to `http://127.0.0.1:5000`. If the
backend or database is unavailable, the page displays a connection error and
does not fall back to simulated course data. Automatic timetable generation is
intentionally outside the Course Explorer scope.

## Backend

The Express/MySQL backend is in `backend`. API details are documented in
`backend/docs/API.md`, and database setup scripts are in `database`.
