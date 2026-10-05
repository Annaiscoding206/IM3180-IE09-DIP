# Smart STARS Companion Backend API

Updated: 5 October 2026 — Backend Person 1, Week 8.

This reference covers the implemented course, student, eligibility, planning-request, index, timetable, and final-selection APIs, including the changes verified during Week 8. Auto-generation, preferences, ranking, and alternative recommendations are separate Person 2 integration work; no unverified endpoints for those features are listed here.

## 1. Connection and conventions

Local base URL: `http://localhost:5000/api`

Send JSON request bodies with `Content-Type: application/json`. The backend uses Node.js, Express, and MySQL (`stars_companion_db`). Examples use local/demo records; identifiers are not portable between databases. Use IDs returned by creation endpoints.

### Request IDs versus plan IDs

- A planning request belongs to a student and holds the academic year, semester, and selected courses.
- A plan belongs to a request and holds chosen course indexes.
- `/plans/:requestId/courses` uses a **request ID**, despite the `/plans` prefix.
- Other plan endpoints below use a **plan ID**.

### Response envelopes

Responses are not all wrapped identically. Preserve these existing contracts in frontend integration:

| Endpoint family | Success envelope |
|---|---|
| Course search | `{ success, count, data: [...] }` |
| Course detail / student detail | `{ success, data: {...} }` |
| Student list | `{ success, data: [...] }` |
| Course indexes | `{ success, course_code, count, data: [...] }` |
| Course-index timetable | `{ success, course_code, index_no, timetable_available, count, data: [...] }` |
| Student eligibility | `{ success, ...eligibilityFields }` |
| Selected-course list | `{ success, count, data: [...] }` |
| Add/remove selected course | `{ success, message }` |
| Planning-request and most plan operations | `{ success, data }`, with `count` for arrays |
| Plan timetable | `{ success, plan_id, empty_plan, timetable_available, timetable_complete, missing_slot_indexes, count, data: [...] }` |

The course-index timetable's top-level `index_no` is currently a string; slot and stored-plan index numbers are numbers. Teaching times are strings such as `08:30:00`. Preserve nullable fields rather than substituting fabricated values.

## 2. Endpoint directory

All paths are relative to the base URL.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Check backend/database connection |
| GET | `/courses` | Search/filter courses |
| GET | `/courses/:courseCode` | Course detail, including indexes |
| GET | `/courses/:courseCode/indexes` | Index options |
| GET | `/courses/:courseCode/indexes/:indexNo/timetable` | Index timetable |
| GET | `/students` | Student list |
| GET | `/students/:studentId` | Student profile |
| GET | `/students/:studentId/eligibility/:courseCode` | Academic eligibility, optionally with `request_id` |
| POST | `/planning-requests` | Create request |
| GET | `/planning-requests?student_id=DEMO001` | List student requests |
| GET | `/planning-requests/:requestId` | Request detail |
| POST | `/planning-requests/:requestId/plans` | Create plan |
| GET | `/planning-requests/:requestId/plans` | List request plans |
| GET | `/plans/:requestId/courses` | Selected courses |
| POST | `/plans/:requestId/courses` | Add selected course |
| DELETE | `/plans/:requestId/courses/:courseCode` | Remove selected course |
| GET | `/plans/:planId` | Plan metadata |
| GET | `/plans/:planId/indexes` | Chosen indexes |
| PUT | `/plans/:planId/indexes/:courseCode` | Add/replace index |
| DELETE | `/plans/:planId/indexes/:courseCode` | Remove index |
| GET | `/plans/:planId/timetable` | Combined timetable |
| GET | `/plans/:planId/clashes` | Stored timetable validation |
| POST | `/plans/:planId/clash-check` | Preview candidate index |
| GET | `/plans/:planId/eligibility` | Plan academic eligibility |
| GET | `/plans/:planId/validation` | Combined final validation |
| POST | `/plans/:planId/select` | Validate and select final plan |

## 3. Health

`GET /health` returns 200:

```json
{ "success": true, "message": "Backend and database are connected" }
```

A database connection failure returns 500 with `success: false` and an error message.

## 4. Course exploration

### GET `/courses`

Optional query filters:

| Parameter | Meaning |
|---|---|
| `search` | Course-code or course-name substring using SQL LIKE |
| `au` | Academic units |
| `semester` | Semester, 1–3 |
| `academic_year` | Academic year, for example `2026-2027` |

Example: `/courses?search=MH1810&semester=1&academic_year=2026-2027`.

Returns distinct course metadata ordered by course code. Multiple indexes do not create duplicate identical metadata rows. Metadata fields include `course_code`, `course_name`, `au`, `grading_type`, `exam_datetime`, `prerequisite_text`, `restriction_text`, `mutually_exclusive_text`, `bde`, `gepe`, `academic_year`, and `semester`.

No matches is a successful 200 response:

```json
{ "success": true, "count": 0, "data": [] }
```

Invalid filters return 400; unexpected database errors return 500.

### GET `/courses/:courseCode`

Returns course metadata in `data`, with an `indexes` array containing `index_no`, `vacancy`, and `vacancy_updated_at`. A missing course returns 404. Invalid course-code input returns 400.

Course codes are normalized to uppercase; supported course-code inputs contain 1–10 letters or digits. Display prerequisite/restriction text is descriptive; use the eligibility endpoint for decisions.

### GET `/courses/:courseCode/indexes`

Returns index options ordered by index number, with top-level `course_code`, `count`, and `data`. Each option contains `index_no`, `vacancy`, and `vacancy_updated_at`. Missing course: 404. Vacancy values may be null; they are not live NTU availability guarantees.

### GET `/courses/:courseCode/indexes/:indexNo/timetable`

The index must belong to the course. Invalid index input returns 400; an unknown course/index pair returns 404. An existing pair with no sessions returns 200 with `timetable_available: false`, `count: 0`, and an empty `data` array.

Example response with one illustrative session:

```json
{
  "success": true,
  "course_code": "MH1810",
  "index_no": "15091",
  "timetable_available": true,
  "count": 1,
  "data": [{
    "slot_id": 173,
    "course_code": "MH1810",
    "index_no": 15091,
    "class_type": "LECTURE",
    "class_group": null,
    "day_of_week": "MON",
    "start_time": "08:30:00",
    "end_time": "10:30:00",
    "venue": "LT1",
    "teaching_weeks": null
  }]
}
```

Sessions are ordered Monday through Sunday, then by start time with stable tie ordering. This example illustrates the format, not the complete timetable for that index.

## 5. Student profiles

`GET /students` returns student records in `data`. `GET /students/:studentId` returns one record or 404 when missing.

Profile fields: `student_id`, `student_name`, `programme`, `study_year`, and `created_at`. These documented routes are reads; no profile-edit endpoint is claimed here.

## 6. Course eligibility

### GET `/students/:studentId/eligibility/:courseCode`

Optional query parameter: `request_id`, a positive request ID belonging to the student.

Example: `/students/TEST_COREQ_W7/eligibility/MH1811?request_id=3`.

An academic rejection is still a successful eligibility evaluation: HTTP 200 with `eligible: false`. Invalid request-ID input returns 400. Missing student/course or a request not belonging to the student returns 404.

| Field | Meaning |
|---|---|
| `student_id`, `course_code`, `request_id` | Evaluated identities; request ID may be null |
| `corequisite_context` | Which selected courses were considered |
| `prerequisite_eligible` | All prerequisite groups satisfied by completed courses |
| `corequisite_eligible` | All corequisite groups satisfied in the current context |
| `programme_eligible` | true, false, or null for unresolved cohort rules |
| `mutual_exclusion_eligible` | No completed/selected-course exclusion conflict |
| `can_select` | Prerequisites, programme, and mutual exclusions pass |
| `eligible` | All academic checks, including corequisites, pass |
| `requires_review` | Programme eligibility cannot be confirmed |
| `missing_prerequisite_groups`, `missing_corequisite_groups` | Unsatisfied groups, each with `requirement_group` and `alternatives` |
| `missing_prerequisites` | Compatibility field: flattened alternatives in unsatisfied prerequisite groups |
| `conflicting_completed_courses`, `conflicting_selected_courses` | Conflicting course-code arrays |
| `programme_restrictions`, `unresolved_restrictions` | Programme rule details |
| `message` | Human-readable explanation |

### Rules and contexts

- Any alternative satisfies its group (OR); every group must be satisfied (AND).
- Prerequisites use completed courses, not concurrent selections.
- Without `request_id`, corequisites use completed courses only: `completed_courses_only`.
- With `request_id`, corequisites also use request-selected courses: `completed_and_request_selected_courses`.
- Plan eligibility uses only completed courses plus courses actually included in that plan: `completed_and_plan_courses`.
- Mutual exclusion is checked in both directions, even when only one direction is stored, against completed and context-selected courses.
- A missing corequisite alone permits incremental selection (`can_select: true`) but prevents final academic eligibility (`eligible: false`).
- Relevant cohort rules cannot be inferred from study year. Unresolved eligibility returns `programme_eligible: null`, `requires_review: true`, and blocks selection. A definite general programme denial remains false.

Example of an unsatisfied corequisite group:

```json
{ "requirement_group": 1, "alternatives": ["MH1810"] }
```

## 7. Planning requests and plan creation

### POST `/planning-requests`

```json
{
  "student_id": "DEMO001",
  "academic_year": "2026-2027",
  "semester": 1,
  "target_au": 12
}
```

Returns 201 with the created request in `data`. `target_au` is optional/null or a positive integer. Semester must be 1–3. Academic year must be a nonempty string of at most 20 characters; student ID at most 15 characters. The student must exist.

`GET /planning-requests?student_id=...` lists requests with `count` and `data`. The student parameter is required. `GET /planning-requests/:requestId` returns request detail. Invalid IDs return 400; missing resources return 404.

### POST `/planning-requests/:requestId/plans`

```json
{ "plan_name": "Plan A" }
```

Returns 201 with the created plan in `data`. Plan name must be nonempty and at most 50 characters. Duplicate names within the same request return 409. Creating a plan does not generate its indexes automatically.

`GET /planning-requests/:requestId/plans` returns the request's plans with `count` and `data`. `GET /plans/:planId` returns plan metadata, including its request and student context, status, rankings/scores where present, and timestamps.

## 8. Request-selected courses

### GET `/plans/:requestId/courses`

Returns `{ success, count, data }`; each row contains `request_id` and `course_code`, ordered by course code. Existing empty requests return 200 with an empty list. Invalid ID: 400. Missing request: 404.

### POST `/plans/:requestId/courses`

```json
{ "course_code": "MH1811" }
```

Course code is trimmed, normalized to uppercase, and restricted to 1–10 letters or digits. The student is obtained from the request; sending a different student ID in the body does not override it.

Success: 201, `{ "success": true, "message": "Course added successfully" }`.

Duplicate: 409. Missing resource: 404. Failed `can_select`: 422 with eligibility fields at the top level alongside `success: false` and `message`. Missing corequisites alone do not block adding.

### DELETE `/plans/:requestId/courses/:courseCode`

Success: 200, `{ "success": true, "message": "Course removed successfully" }`.

If the course has an index in any plan under the request, returns 409 with `affected_plans`, an array of `{ plan_id, plan_name }`. Remove those plan indexes first. Missing selection returns 404.

Successful course additions/removals clear rankings and scores for plans under that request and reset SELECTED plans to GENERATED.

## 9. Chosen indexes

### GET `/plans/:planId/indexes`

Returns `count` and `data` containing stored plan-course rows, including course/index identity and the `locked` flag.

### PUT `/plans/:planId/indexes/:courseCode`

```json
{ "index_no": 15091 }
```

Checks that the course is selected in the parent request, the course/index exists, its academic year/semester match, `can_select` passes, and the resulting timetable can be saved. Corequisites can remain temporarily incomplete while building the plan.

Success is 201 for insertion or 200 for replacement. `data` contains `created`, `plan_id`, `course_code`, `index_no`, and timetable `validation`. Replacing an index excludes the old index during clash checking and preserves its `locked` flag.

Failures: 400 invalid input; 404 missing plan/pair; 422 unselected course, wrong term, academic selection rejection, or timetable failure. Academic rejection includes `eligibility`; timetable rejection includes `validation`. Rejected writes do not modify stored indexes.

### DELETE `/plans/:planId/indexes/:courseCode`

Removes the chosen index, not the request-selected course. Returns 200 with `data: { plan_id, course_code }`; absent chosen index returns 404.

Successful index writes/removals clear that plan's ranking/score and reset SELECTED to GENERATED. Explicit edits are not prevented by the `locked` flag; that flag is reserved for regeneration behavior.

## 10. Timetable display and clash validation

### GET `/plans/:planId/timetable`

Top-level fields: `success`, `plan_id`, `empty_plan`, `timetable_available`, `timetable_complete`, `missing_slot_indexes`, `count`, and session array `data`.

- `timetable_available`: at least one session exists.
- `timetable_complete`: the plan is nonempty and every chosen index has session data.
- `missing_slot_indexes`: course/index pairs without sessions.
- Sessions use the same identity/day/time/venue/week fields as course-index timetables and are ordered Monday–Sunday, then by start time.

Completeness here does not establish academic eligibility or absence of clashes. An empty plan has both availability and completeness false.

### GET `/plans/:planId/clashes`

Evaluates stored indexes and returns the result in `data`.

### POST `/plans/:planId/clash-check`

```json
{ "course_code": "MH1810", "index_no": 15091 }
```

Previews an add/replacement without saving. Candidate selection rules still apply. A valid preview request returns 200 with the result in `data`, even when `can_save` is false. Preview includes the `candidate` pair.

Timetable results contain `plan_id`, `status` (`clear`, `conflict`, or `incomplete`), `can_save`, `conflicts`, `missing_slot_indexes`, `data_issues`, and `warnings`.

Conflict entries identify both sessions and the overlapping time interval; `certainty` distinguishes confirmed week overlap from potential overlap.

- Adjacent classes are allowed; different days do not clash.
- Numeric teaching-week lists/ranges use week intersection.
- Missing/blank teaching weeks produce warnings and assume possible overlap.
- Unsupported/malformed week values, invalid time/day data, or missing slots make validation incomplete and block saving.
- Sessions within the same index are also checked against one another.
- An empty plan may have no clashes; final validation separately rejects empty plans.

## 11. Plan academic eligibility

### GET `/plans/:planId/eligibility`

Returns `data` containing `plan_id`, `request_id`, `student_id`, `eligible`, `empty_plan`, `requires_review`, `missing_index_courses`, `unselected_courses`, and per-course `courses` results.

Every requested course must have an index, no unselected course may appear in the plan, the plan must be nonempty, and every included course must be academically eligible. Corequisites use actual plan courses, not merely request selections.

This endpoint does not by itself establish timetable validity. Academic failure is reported in a 200 response with `eligible: false`.

## 12. Combined final validation

### GET `/plans/:planId/validation`

Returns `{ success: true, data: ... }`, where `data` contains:

| Field | Meaning |
|---|---|
| `plan_id`, `request_id` | Plan/request identity |
| `can_finalize` | All implemented final checks pass |
| `requires_review` | Academic manual-review flag |
| `invalid_term_indexes` | Missing course/index pairs or mismatched/null year/semester |
| `eligibility` | Full plan academic result |
| `timetable` | Full timetable validation result |

`can_finalize` requires academic eligibility, timetable `can_save`, and no invalid-term indexes. Failed readiness is a 200 evaluation response with `can_finalize: false`. This GET does not change selected status.

Final validation currently does not enforce target AU, exam clashes, live vacancies, or Person 2's preference/ranking constraints. It must not be presented as official university registration approval.

## 13. Final plan selection

### POST `/plans/:planId/select`

No body is required. Revalidates and selects within one database transaction.

Success: 200 with `data.plan_id`, `data.request_id`, `data.status: "SELECTED"`, and the complete result in `data.validation`.

Other SELECTED plans for the same request become GENERATED. At most one plan is selected through this flow. Plan editing or request-course changes require selection to be performed again.

Failed readiness: 422 with top-level `success: false`, `message: "Plan cannot be selected: final validation failed"`, and `validation`. An invalid plan is not selected.

The frontend must call this POST operation when confirming a plan; an earlier GET validation result is not a substitute. Selection is internal to this application and does not register courses with NTU.

### Concurrency behavior

Plan mutations lock the parent planning request before locking the plan. Request-course mutations lock the same parent. Transactions use READ COMMITTED so subsequent reads see changes committed while waiting. Tests cover competing conflicting index writes, mutually exclusive course additions, and final selections under one request. Person 2's writers must follow the same locking and validation conventions.

## 14. Errors and frontend handling

| HTTP status | Meaning |
|---|---|
| 200 | Successful read, update, removal, or final selection |
| 201 | Request/plan/course selection/index created |
| 400 | Invalid input |
| 404 | Requested resource not found |
| 409 | Duplicate name/course or course still used by plans |
| 422 | Selection, timetable, or final-validation rejection |
| 500 | Unexpected server/database failure |

Most errors contain `success: false` and `message`; validation errors add details as documented for each endpoint. Frontend code should branch on status and structured fields, not parse message wording. A 200 eligibility/validation response can report an ineligible plan or course.

## 15. Local configuration and testing

Example `backend/.env` (do not commit credentials):

```dotenv
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_LOCAL_PASSWORD
DB_NAME=stars_companion_db
```

Run from the backend directory:

```powershell
npm start
```

Unit/controller tests:

```powershell
node --test tests/course.test.js tests/clash.test.js tests/eligibility.test.js
```

MySQL/HTTP integration tests:

```powershell
$env:RUN_MYSQL_TESTS = "1"
node --test tests/planning.integration.test.js
Remove-Item Env:RUN_MYSQL_TESTS
```

The integration test is opt-in, starts its own server on an available port, creates temporary records in the configured local database, and cleans up its fixtures. The normal server can stay running. No schema reset is required.

Reported verification on 5 October 2026: 24 eligibility tests passed and 22 integration tests passed after fixing lock order. Course/clash tests previously passed; do not interpret these separate runs as a new full-suite result. Final selection, invalid/empty requests, corequisite context, mutual-exclusion rejection, index mutation protections, and the listed concurrency cases have coverage. These results do not certify frontend or auto-generation integration.

## 16. Demo data and known limitations

- Local MH1811 index 50001 sessions labelled TEST at DEMO-LT/DEMO-TR were added for testing. They are synthetic, not verified university timetable data.
- Optional Week 8 fixtures are provided in
  `database/04_week8_demo_data.sql`. Run after the schema and course
  catalogue are loaded. It creates TEST_COREQ_W7 if missing and adds
  synthetic MH1811 index 50001 sessions only when that index has no
  sessions. Existing records are preserved.
- The original demo setup is in `database/03_demo_data.sql`; do not
  rerun it blindly on an already populated database.
- Create planning requests and plans through the API and use their
  returned IDs. Request 3 and plan 2 are Anna's local IDs, not shared
  constants.
- Missing timetable data must stay visible; do not invent official schedules.
- Teaching weeks, vacancies, and other catalogue fields may be null.
- Cohort-dependent restrictions require review when cohort data is unavailable; no manual-review approval endpoint is documented here.
- Auto-generation, ranking, preferences, and alternatives require Person 2 integration with shared validation.
- Authentication/authorization guarantees are not established by the tests described here. A supplied student/request ID must not be treated as authenticated identity.
- Complete-flow handoff and frontend integration verification remain open.

## 17. Frontend and Person 2 handoff

1. Search courses; retrieve details, indexes, and index sessions.
2. Create/retrieve a student planning request and retain its returned request ID.
3. Evaluate courses with that request context and add courses using `can_select`.
4. Create/retrieve a plan and retain its separate plan ID.
5. Choose indexes and display API rejection details without assuming a rejected write succeeded.
6. Retrieve timetable and combined validation; show missing courses, conflicts, warnings, and manual-review requirements.
7. Confirm with POST `/plans/:planId/select` and use the returned status.
8. Refresh status and validation after course/index edits.

Person 2 should evaluate generated combinations against actual included courses, verify timetable data and clashes, and preserve the parent-before-plan lock order for persisted changes. Direct database writes that bypass these services do not automatically receive these guarantees.
