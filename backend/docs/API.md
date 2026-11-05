# Smart STARS Companion API

Local base URL: `http://127.0.0.1:5001/api`. JSON request bodies use `Content-Type: application/json`. See [setup](../../docs/SETUP.md) for database extensions and demo configuration.

## Conventions and identity

Most successful operations return `{ "success": true, "data": ... }`; list endpoints often add `count`. Eligibility and the existing timetable endpoints have the specific envelopes shown below. Errors return `{ "success": false, "message": "..." }`, optionally with `code`, `validation`, `reasons`, `suggestions` or other evidence. IDs in examples are illustrative; use IDs returned by your database.

Each independent plan owns selected **course codes** in `plan_selected_course`, blocked periods in `plan_blocked_period`, and chosen **course/index pairs** in `plan_course`. Selection does not require an index. `request_id` and `plan_id` are never interchangeable. `planning_request_course` and `/plans/:requestId/courses` remain legacy request/bulk interfaces; their writes can mirror changes into nonarchived child plans. Request-level block writes are also legacy/bulk behavior. Updated frontend and Leo selection flows use plan-scoped selections, blocks and regeneration; callers must not use legacy writes to edit a single plan.

Planning, Degree Audit and curriculum operations require a trusted server-side `res.locals.authenticatedStudentId`. For this local prototype, `DEMO_PLANNING_ENABLED=true`, a loopback connection, non-production mode and a permitted local Origin resolve the server-configured `DEMO_PLANNING_STUDENT_ID` (default `DEMO001`). Only `DEMO001` and `DEMO002` are allowed, and the configured student must exist. Invalid/empty configuration or lookup failure returns 503 `DEMO_IDENTITY_UNAVAILABLE`; it never falls back to another student. A supplied body/query `student_id` is a scope check, never authentication. Root request create/list must match this identity (404 otherwise); foreign request/plan resources return 404. No browser identity header is accepted.

`GET /api/students/current` uses the same identity middleware and returns
`{"success":true,"data":{"student_id":"DEMO002","demo_switch_enabled":true}}` in local demo mode.
Query parameters cannot choose the identity. The browser resolves this before
mounting Explorer, Planner, Profile, export or Leo. Website chat (with
`DEMO_CHAT_ENABLED=true`) and the allowlisted Telegram sender reuse the same
validated resolver. `POST /api/students/current` accepts only
`{"student_id":"DEMO001"}` or `{"student_id":"DEMO002"}` and changes the
current process's in-memory identity after checking student existence. It requires
local, non-production demo planning authentication; trusted authentication alone
does not enable switching. Invalid IDs return 400 `INVALID_DEMO_STUDENT`, missing
students 404 `DEMO_STUDENT_NOT_FOUND`, and lookup failures 503
`DEMO_IDENTITY_UNAVAILABLE`. A rejected switch preserves the previous identity.
No database or environment values are written. GET/POST return the same data shape.
The frontend remounts student-scoped components after fresh bootstrap. The choice
affects all clients of this process, resets on restart, and does not propagate
to a separately running Telegram bot. See `docs/ACTIVE_DEMO_IDENTITY.md`.

Course catalogue reads are public; trusted/demo identity adds completion and curriculum annotations. Explicit catalogue planning context requires trusted identity. All student routes require trusted identity, with matching student scope for detail, eligibility, Degree Audit and Curriculum. Demo identity is not production authentication. Chat has a separate `DEMO_CHAT_ENABLED=true` opt-in and local-only access; see the chat section.

Common HTTP statuses:

| Status | Meaning |
|---|---|
| 200 | Read/update/delete, or a chat reply (inspect `planning_result` for action outcome) |
| 201 | Created request, plan, selected course, blocked period, newly chosen index, or generated batch |
| 400 | Invalid ID, body/filter, malformed time, duplicate preference input |
| 401 | Required trusted/demo identity absent |
| 403 | Disallowed local origin/environment |
| 404 | Resource missing or outside the student's ownership scope |
| 409 | Duplicate selection/name/block, archived edit, source-plan ambiguity, search limit, curriculum/selection ambiguity, or removal guard |
| 422 | Academic/term/timetable/constraint validation fails or no feasible plan |
| 500 | Database/unexpected planning failure |
| 503 | Chat/model/history service unavailable |

Malformed JSON is rejected by Express before controllers and may return HTML, rather than the JSON error envelope.

## Health, courses and student profile

| Method and path | Input / result |
|---|---|
| `GET /health` | Executes `SELECT 1`; `{success:true,message:"Backend and database are connected"}` |
| `GET /courses` | Optional `search`, `au`, `academic_year`, `semester` (1–3); returns catalogue rows, `course_types` array, count |
| `GET /courses/:courseCode` | Course metadata and `indexes`; 404 unknown course |
| `GET /courses/:courseCode/indexes` | `{success,course_code,count,data:[...]}` |
| `GET /courses/:courseCode/indexes/:indexNo/timetable` | `{success,course_code,index_no,timetable_available,count,data:[session...]}`; valid pair with no slots is 200 with `[]`; unknown pair is 404 |
| `GET /students` | Demo student list |
| `GET /students/:studentId` | Profile, programme, study/admission years, route, `completed_courses`, `degree_audit_summary`, `curriculum_progress` |
| `GET /students/:studentId/eligibility/:courseCode` | Optional owned `plan_id`; omitted means academic-only; returns `planning_context` |

Catalogue annotations include `is_completed`, `completion_status` (`Completed` / `Not completed`), `curriculum_status` (`COMPLETED`, `PLANNED`, `NOT_YET_TAKEN`), category/group, matching state and planning request ID. Completion comes from PASSED academic records, not browser state. Status and eligibility are separate.

Eligibility response fields are **top level**, e.g. this abbreviated success:

```json
{"success":true,"student_id":"DEMO001","course_code":"IE3014","prerequisite_eligible":true,"programme_eligible":true,"eligible":true,"can_select":true,"already_completed":false,"requires_review":false}
```

The full response also includes corequisites, mutual exclusions, missing requirement groups and verified curriculum-year rules. Options in one requirement group are OR; groups are AND. `can_select` permits incremental selection before a valid corequisite is added; `eligible` includes current corequisite satisfaction. Passed courses cannot be reselected. Unknown student/course: 404. Cohort restriction strings without supported verified rules require review rather than a guessed interpretation. Recommended curriculum years never become eligibility restrictions.

## Degree Audit and Programme Curriculum

| Method and path | Query / result |
|---|---|
| `GET /students/:studentId/degree-audit` | Optional `academic_year`, `semester` (1–3), `result` (`PASSED`, `FAILED`, `IN_PROGRESS`) |
| `GET /students/:studentId/curriculum` | Optional owned `plan_id` for planned-course context |
| `GET /students/:studentId/curriculum/progress` | Same context query and current curriculum/progress representation |

Example:

```http
GET /api/students/DEMO001/degree-audit?academic_year=2025-2026&semester=2&result=PASSED
```

Degree Audit `data` contains `student_id`, `filters`, `records`, `passed_course_codes`, `earned_au`, `earned_au_complete`, `summary`, `filtered_summary` and `summary_scope:"all_academic_records"`. Each record has course code/title, nullable academic year/semester/grade, result, earned AU and provenance. Filters narrow `records` and `filtered_summary`; overall completion/AU remains across the full history. PASSED attempts count once per course; failed and in-progress attempts never count. Unknown legacy AU is reported as incomplete, not invented or silently treated as a known zero.

Curriculum `data` contains `curriculum` (including `is_demo`), `matching`, `categories`, `courses`, `summary`, `degree_audit_summary`, and `planning_context`. Categories and elective groups expose required/completed/remaining AU and completed/remaining course requirements. Courses expose status and eligibility separately. Matching is exact programme/admission year/route, with route-independent matching only if the stored curriculum explicitly has a null route. No match: 404 `NO_CURRICULUM`; multiple matches: 409 `AMBIGUOUS_CURRICULUM`. The seeded curriculum is a synthetic prototype subset, not an official graduation audit.

### Shared planning context

Curriculum, student eligibility and authenticated catalogue annotations accept `plan_id` and optional matching `request_id`. Both IDs must be positive integers. No plan means `ACADEMIC_ONLY`, with `selected_course_codes: []`; no latest-request or legacy selection fallback occurs. Request alone returns 400 `PLAN_ID_REQUIRED`; a foreign/missing plan or mismatched request returns 404; an archived plan returns 409 `PLAN_ARCHIVED`. Reads do not initialize or backfill selections.

Explicit context reports `scope: "EXPLICIT_PLAN"`, `plan_id`, `plan_name`, `plan_status`, `request_id`, `academic_year`, `semester`, `selection_source: "plan_selected_course"`, and `selected_course_codes`. Academic-only context reports the same fields with null metadata and an empty selection. Course catalogue list/detail accepts these context query parameters alongside catalogue filters.

Status priority is PASSED → `COMPLETED`, otherwise selected in this explicit plan → `PLANNED`, otherwise `NOT_YET_TAKEN`. Sibling plans, stale request selections and index assignments never contribute to status. Degree Audit, completed courses and earned/completed AU remain student-wide. Selection-dependent corequisites and mutual exclusions use the same explicit selection set through the existing eligibility service; status is not an eligibility result.

Leo uses this resolver after resolving an explicit plan or exactly one currently valid confirmed plan. With no unambiguous plan it asks for clarification, including before regeneration. Frontend callers pass `workingPlanId` and invalidate selection-dependent requests on plan changes and course edits; late responses cannot replace current-plan data.

No public academic-record/profile/curriculum mutation or upload endpoints are implemented. Internal seed/import/profile services own validation and invalidation; direct SQL bypasses these writers, so final/selected retrieval still revalidates current data.

## Planning requests and selected courses

| Method and path | Body / result |
|---|---|
| `POST /planning-requests` | `{student_id,academic_year,semester,target_au?}`; created request |
| `GET /planning-requests?student_id=DEMO001` | Owned requests in request-ID order |
| `GET /planning-requests/:requestId` | Owned request metadata |
| `GET /plans/:requestId/courses` | Selected courses, count |
| `POST /plans/:requestId/courses` | `{course_code:"IE3014"}`; uses `can_select` and request term |
| `DELETE /plans/:requestId/courses/:courseCode` | Removes request course if removal guard permits |

```json
{"student_id":"DEMO001","academic_year":"2026-2027","semester":1,"target_au":18}
```

Repeated selection returns 409; ineligible/completed/not-offered course returns 422. Removing a course referenced by a non-archived plan returns 409 with `affected_plans`; remove those chosen indexes explicitly first. Archived plan history is preserved. Removing a corequisite can invalidate remaining plans; it does not silently remove their courses.

## Preferences and blocked periods

| Method and path | Body / result |
|---|---|
| `GET /planning-requests/:requestId/preferences` | Saved day/time/objective arrays, empty arrays initially |
| `PUT /planning-requests/:requestId/preferences` | Atomic full replacement; all three arrays required |
| `GET /planning-requests/:requestId/blocked-periods` | `data:{request_id,blocked_periods:[...]}` |
| `POST /planning-requests/:requestId/blocked-periods` | `{day_of_week,start_time,end_time}`; created block |
| `DELETE /planning-requests/:requestId/blocked-periods/:blockId` | Removes one owned block |
| `DELETE /planning-requests/:requestId/blocked-periods` | Clears blocks; `data:{request_id,removed_count}` |

Example full preference replacement:

```json
{
  "day_preferences":[{"day_of_week":"MON","preference_type":"PREFER","constraint_level":"HARD"},{"day_of_week":"WED","preference_type":"PREFER","constraint_level":"HARD"}],
  "time_preferences":[{"start_time":"09:00","end_time":"18:00","preference_type":"PREFER","constraint_level":"HARD"}],
  "objectives":[{"objective_type":"MINIMIZE_SCHOOL_DAYS","priority":1},{"objective_type":"MINIMIZE_GAPS","priority":2}]
}
```

Response: `{success:true,data:{request_id,day_preferences,time_preferences,objectives,changed}}`. Empty arrays clear their collections. Blocks are independent and never replaced by this PUT. Unknown/extra fields, missing arrays, duplicate day/type or normalized time-range/type, repeated objective, `UNSPECIFIED`, malformed/empty/reversed time ranges, and nonpositive/noninteger priorities return 400. Times accept `HH:MM` or `HH:MM:SS`, normalize to seconds, and must remain within one day. Days are `MON`–`SUN`.

- HARD PREFER days are an allowed-day whitelist. Every session must be on one of those days; attendance on every preferred day is not required.
- HARD PREFER time windows are alternatives. Every session must fit fully inside at least one window; adjacent windows are not merged.
- HARD AVOID days prohibit all sessions that day. HARD AVOID times prohibit any overlap on any day.
- Contradictory rules remain enforced together; infeasibility is reported, never silently relaxed.
- SOFT rules influence ranking only. Priority 1 has highest weight for `MINIMIZE_SCHOOL_DAYS` / `MINIMIZE_GAPS`.
- A blocked period is day-specific hard unavailability, across all teaching weeks. Overlap uses `class_start < block_end && block_start < class_end`; adjacent boundaries are allowed. Duplicate exact block returns 409; removing unknown block returns 404.

Changed preferences/blocks clear non-archived rankings and reset SELECTED plans to GENERATED. Identical preference replacement is a no-op. Failed replacements roll back all collections and invalidation.

## Plans, chosen indexes and validation

| Method and path | Body / result |
|---|---|
| `POST /planning-requests/:requestId/plans` | `{plan_name:"My plan"}`; creates empty plan; `AUTO Plan ...` names reserved |
| `GET /planning-requests/:requestId/plans` | All plans with current validation/selection state, including archived history |
| `GET /plans/:planId` | Plan metadata plus current validation/selection state |
| `GET /plans/:planId/summary` | Above plus label, indexes, every session, current comparison metrics |
| `GET /plans/:planId/indexes` | Chosen indexes, including stored `locked` |
| `PUT /plans/:planId/indexes/:courseCode` | `{index_no:32101}`; add (201) or replace (200) |
| `DELETE /plans/:planId/indexes/:courseCode` | Remove chosen index; request course remains selected |
| `PUT /plans/:planId/indexes/:courseCode/lock` | `{locked:true}` or `{locked:false}`; chosen index must exist |
| `GET /plans/:planId/timetable` | Existing timetable envelope below |
| `GET /plans/:planId/clashes` | Timetable-only check of current indexes |
| `POST /plans/:planId/clash-check` | `{course_code:"IE3014",index_no:32101}`; full candidate preview, no writes |
| `GET /plans/:planId/eligibility` | Current academic validation of chosen course set |
| `GET /plans/:planId/validation` | Full current validation |
| `POST /plans/:planId/select` | No body required; validate and finalize |
| `GET /planning-requests/:requestId/active-plan` | Currently valid finalized plan, or null; never picks an arbitrary generated plan |

Index writes require the course to be selected in the parent request, a matching course/index pair and matching request term. Shared academic, clash, blocked-period and hard-rule checks apply. Replacements ignore the course's old index. Missing/malformed timetable data blocks saving. Pending corequisites and not-yet-indexed selected courses can remain during incremental manual planning (`can_save`); finalization requires the complete valid course/index set (`can_finalize`). Failed writes leave plan data unchanged.

Locks constrain regeneration from the explicit source plan; the server never auto-replaces them. Explicit manual index replacement is permitted and retains the lock flag. Lock changes invalidate that plan's saved ranking/selection metadata. Archived plans cannot be edited, locked or selected.

Validation response (abbreviated):

```json
{"success":true,"data":{"plan_id":21,"request_id":10,"can_save":true,"can_finalize":true,"requires_review":false,"invalid_term_indexes":[],"eligibility":{"eligible":true,"missing_index_courses":[]},"timetable":{"status":"clear","can_save":true,"conflicts":[],"missing_slot_indexes":[],"data_issues":[],"warnings":[]},"constraints":{"valid":true,"violations":[]}}}
```

Clashes require same day and `startA < endB && startB < endA`, plus potentially overlapping teaching weeks. Known disjoint week sets do not clash. Missing/NULL weeks conservatively overlap and produce warnings. Supported stored weeks are numeric weeks/ranges/comma lists (e.g. `1-13`, `2,4,6`); malformed values cause incomplete validation. Conflict evidence identifies both courses/indexes/slots, day, overlap times, overlapping weeks and `certainty` (`confirmed` / `potential`).

Existing timetable envelope is preserved:

```json
{"success":true,"plan_id":21,"empty_plan":false,"timetable_available":true,"timetable_complete":true,"missing_slot_indexes":[],"count":1,"data":[{"course_code":"IE3014","index_no":32101,"slot_id":1,"class_type":"LECTURE","day_of_week":"MON","start_time":"09:00:00","end_time":"10:00:00","teaching_weeks":"1-13","venue":"Demo room"}]}
```

`data` is a flat session array. `timetable_complete` here describes slot availability; it does **not** imply full academic/constraint validity. Use `/validation` for that decision.

Final selection reruns Degree Audit, verified curriculum restrictions, term/completeness, corequisites/exclusions, clashes, blocks and hard preferences. Invalid finalization is 422 with `validation`. Successful selection makes one plan SELECTED per request, resetting any previous selection to GENERATED. Plan reads expose:

| Field | Meaning |
|---|---|
| `stored_status` | Database status |
| `status` | Effective status (stale SELECTED is presented as GENERATED) |
| `selection_state` | `ACTIVE_VALID`, `STALE_INVALID`, `NOT_SELECTED`, `ARCHIVED` |
| `active_selection` | True only for a currently valid SELECTED plan |

Supported writers invalidate metadata; retrieval also catches invalidity introduced by external SQL without mutating history. An invalidated GENERATED plan has `NOT_SELECTED`; no historical-selection timestamp is invented. A stale stored SELECTED plan has `STALE_INVALID`.

Active response: `{success:true,data:{request_id:10,status:"active_selection",plan:{...summary},stale_plan_ids:[]}}`. Without a valid selection: `status:"no_active_selection",plan:null`. Unexpected multiple valid selections return 409 `AMBIGUOUS_SELECTION`.

## Automatic generation and alternatives

`POST /planning-requests/:requestId/generate-plans`

```json
{"source_plan_id":21}
```

`{}` is permitted when no plan for that request has locks. If locks exist and no source is supplied, 409 `SOURCE_PLAN_REQUIRED` returns `locked_plan_ids`. Source must be an owned child of this request. Existing generation semantics also allow reading locks from an archived source; the archived source itself is not edited. Only that source's locks constrain this run.

Returns 201 `{success:true,data:{request_id,source_plan_id,plans,search,retired_plan_ids,...}}`. One to three distinct complete options are persisted with labels Plan A/B/C, generated `plan_name`, rank, match score, indexes, metrics and final validation. Fewer feasible options means fewer returned plans. It does not finalize any plan. Previous replaceable generated batches are archived; selected, archived, manual and explicit source plans are preserved. No plan/index persistence occurs on failure.

`metrics` includes `campus_days`, `total_gap_minutes`, soft day/time reward and penalty, unrounded `cost`, and `match_score`. Gap metrics use the weekly session footprint, merging overlaps before measuring gaps; teaching-week-specific attendance is not separately scored. Rank uses unrounded cost, then deterministic canonical index combination. Score is `round(100/(1+cost),2)`; cost combines normalized soft penalties and objective metrics divided by positive priority. These are prototype comparison scores, not official registration likelihood. `/summary` recomputes metrics against current saved preferences (`metrics_scope:"current_saved_preferences"`); saved rank/score may be null after invalidation.

Search is bounded (currently 20,000 nodes / 200 candidates). Always inspect `search.exhaustive`; a successful bounded search is not a claim of global optimality. No-plan errors distinguish exhaustive failure (422 `NO_FEASIBLE_PLAN`) from an exhausted search budget (409 `SEARCH_LIMIT_REACHED`). Responses include `plans:[]`, `search`, `infeasibility_proven`, `reasons` and `suggestions`. Search evidence can describe multiple conditions rather than one proven root cause.

Example error, abbreviated:

```json
{"success":false,"code":"NO_FEASIBLE_PLAN","message":"No feasible timetable satisfies the selected courses and constraints","plans":[],"reasons":[{"reason_id":"reason_1","code":"BLOCKED_PERIOD_CONFLICT","course_code":"IE3014","index_no":32101,"day":"MON","class_start":"09:30:00","class_end":"10:20:00","blocked_start":"10:00:00","blocked_end":"11:00:00","explanation":"Class overlaps a saved blocked period."}],"suggestions":[{"action":"REVIEW_BLOCKED_PERIOD","reason_ids":["reason_1"],"requires_student_action":true,"explanation":"Change or remove the conflicting blocked period."}]}
```

Reason IDs/actions are returned by the service; clients should display explanations rather than infer feasibility from a suggestion. Other reasons include `COURSE_INELIGIBLE`, `COREQUISITE_UNSATISFIED`, `MUTUAL_EXCLUSION`, `COURSE_ALREADY_COMPLETED`, `NO_INDEXES_FOR_TERM`, `INCOMPLETE_TIMETABLE_DATA`, `TIMETABLE_CLASH`, `HARD_DAY_CONSTRAINT`, `HARD_TIME_CONSTRAINT`, `LOCKED_INDEX_INVALID`, `LOCKED_INDEX_CONFLICT`, search-limit and aggregate search evidence.

`GET /plans/:planId/indexes/:courseCode/alternatives?candidate_index_no=32101`

Without `candidate_index_no`, validates the stored chosen index. Without either, 400. The course must already be selected. It checks every same-course, same-term alternative against the complete surrounding plan and shared academic/timetable/hard-rule validation. Alternatives are deterministic, unique and exclude the evaluated index. A partial/otherwise-invalid surrounding plan can yield no valid alternatives.

Response `data` includes `current_index_no`, `candidate_index_no`, `evaluated_index_no`, `evaluation_source`, `locked`, `locked_index_no`, `auto_applied:false`, `validation_scope`, `validation`, `reasons`, `suggestions`, `alternatives`, `rejected_alternatives`, `alternative_count`, and `status` (`alternatives_available` / `no_valid_alternative`). Each suggestion requires explicit student action and subsequent write-time revalidation. No automatic index replacement occurs.

## Leo/chat integration

| Method and path | Contract |
|---|---|
| `POST /chat` | `{message,conversationId?}`; 1–2000 characters, positive integer conversation ID if provided |
| `GET /chat/active` | Active conversation shared by website/allowlisted Telegram demo user; `{success,conversation_id,count,data:[messages]}` or null ID / empty messages |
| `GET /chat/conversations` | Owned conversation list |
| `GET /chat/conversations/:conversationId/messages` | Owned messages; unknown/foreign conversation is 404 |

History requires trusted identity. General stateless chat can run locally without it, but cannot retrieve student data or save/generate plans. Local POST chat is disabled in production and for non-loopback requests; disallowed Origins return 403. Body `studentId` never supplies identity. The optional `conversationId` is ownership checked. With local demo enabled, omitted ID resumes the shared active conversation.

Successful replies return `{success:true,reply,conversation_id?}` with optional `preference_draft` or `planning_result`. HTTP 200 means the chat exchange completed, **not** that a requested planning operation succeeded. Rejected commands return `planning_result:{status:"rejected",success:false,http_status,code?,message,...}`. Model/database failures produce HTTP 503.

Leo tools retrieve trusted profile/audit/curriculum, owned requests and saved constraints, generated plan details, or the current valid selected timetable through shared backend services. An ambiguous selected timetable across requests asks for a request ID; no generated plan is implicitly finalized.

Preference handoff:

1. Identify the request explicitly (Leo can list requests).
2. Interpret to a draft; clarify ambiguous strictness (`UNSPECIFIED`) or missing time boundaries. Draft values are never saved to preference tables.
3. A ready draft is staged in `ai_preference_draft`, bound to student-owned conversation, exact request and opaque draft token. The server renders every rule and warns that confirmation replaces all three preference collections; blocks are unchanged.
4. Send the exact command shown by Leo:

```text
CONFIRM 01234567-89ab-cdef-0123-456789abcdef FOR REQUEST 10
```

Append ` AND GENERATE` to save then generate. Only the current user's whole message matching this format authorizes confirmation. Casual “okay”, model-generated booleans, quoted commands, superseded tokens, foreign IDs, unresolved or already-saved drafts cannot save. Saving and draft status transition share one transaction; success is reported after commit. Generation is a separate transaction: if it fails, the confirmed preferences remain saved and the response shows the separate generation failure.

Independent generation command:

```text
GENERATE REQUEST 10 FROM PLAN 21
```

`FROM PLAN` is optional when no source lock choice is needed. For a locked source, use this command after saving, rather than `AND GENERATE` without a source. Generated summaries include rank/score/metrics/indexes, and structured `planning_result.generation.plans` also includes all sessions and validation. Model interpretation requires OpenAI; recognized commands bypass the model. No command auto-selects a final plan.

See [Leo integration](../../docs/LEO_PREFERENCE_INTEGRATION.md) for tools, tests and limitations. The backend does not implement exam-clash checks, official registration, NTU authentication/import, or an official curriculum audit.

## Catalogue availability and planning terms

`GET /api/courses` without `academic_year`/`semester` filters returns the full
catalogue, one row per course code. Explicit search/AU/year/semester filters
remain supported. Each row includes:

```json
{
  "available_semesters": [
    { "academic_year": "2026-2027", "semester": 1 },
    { "academic_year": "2026-2027", "semester": 2 }
  ],
  "planning_term": { "academic_year": "2026-2027", "semester": 1 },
  "available_for_planning_term": true
}
```

Use `?plan_id=...` for an owned independent plan. Before a plan exists, use
`?planning_request_id=...` for the owned request's **term only**. This does not
provide legacy request selections to eligibility or Curriculum. If both IDs
are supplied they must belong together. The existing `request_id` parameter
still requires `plan_id` for selection-dependent academic context.

Without either context, `planning_term` and `available_for_planning_term` are
null. Availability comes from `course_info`; it is independent of academic
`eligible`/`can_select`. A course lacking an offering remains in the response.
Representative course metadata uses the matching planning-term row when present,
otherwise the latest returned offering. `available_semesters` lists all stored
terms even when an explicit catalogue filter is used.

`GET /api/courses/:courseCode` accepts the same context and returns these fields;
each detail index includes `academic_year` and `semester`. All detail indexes
remain visible. Assignment and generation enforce the request term separately.

Both `POST /api/plans/:planId/selected-courses` and the legacy
`POST /api/plans/:requestId/courses` retain their academic checks and reject
unavailable offerings with HTTP 422, `code: COURSE_NOT_AVAILABLE_IN_TERM`,
`course_code`, `academic_year`, and `semester`. Missing academic prerequisites
or other academic failures may be reported first, as before.

Course detail index choices: `GET /api/courses/:courseCode?plan_id=...`
(or owned `planning_request_id=...`) returns `indexes` for that context's exact
academic year and semester only. Unavailable courses still return their metadata
and `available_semesters`, with `indexes: []`. Without context, course detail
continues returning all offerings. Manual index validation and alternative-index
queries retain their existing term and ownership checks.
