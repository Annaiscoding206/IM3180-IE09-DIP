# Leo Assistant — Timetable Preference Integration

## 1. Overview

Leo Assistant can now interpret students' natural-language timetable preferences through the Smart STARS website and Telegram.

The AI produces structured preference drafts using the OpenAI Agents SDK and Zod validation.

**Current scope:** Interpretation, clarification and conversational confirmation.

**Pending integration:** Persisting confirmed preferences and generating/ranking timetable plans through the planning backend.

## 2. Completed AI Functionality

- Understand preferred and avoided weekdays.
- Understand preferred and avoided class time ranges.
- Identify optimization objectives such as minimizing campus days or timetable gaps.
- Distinguish mandatory constraints (`HARD`) from flexible preferences (`SOFT`).
- Ask for clarification when strictness or exact times are unclear.
- Interpret preference updates across multiple conversation turns.
- Maintain conversation continuity between the website and Telegram.

## 3. Structured Preference Data

### Day preferences

| Field | Accepted values |
|---|---|
| `day_of_week` | MON, TUE, WED, THU, FRI, SAT, SUN |
| `preference_type` | PREFER, AVOID |
| `constraint_level` | HARD, SOFT, UNSPECIFIED |

### Time preferences

| Field | Description |
|---|---|
| `description` | Student's original time preference |
| `start_time` | HH:MM or null |
| `end_time` | HH:MM or null |
| `preference_type` | PREFER, AVOID |
| `constraint_level` | HARD, SOFT, UNSPECIFIED |

### Planning objectives

| Field | Accepted values |
|---|---|
| `objective_type` | MINIMIZE_SCHOOL_DAYS, MINIMIZE_GAPS |
| `priority` | Positive integer; 1 is highest priority |

The preference tool returns one of three statuses: `no_preferences`, `clarification_required`, or `ready_for_confirmation`. It also returns clarification questions and flags indicating that the draft is unconfirmed, unsaved and has not generated a timetable.

## 4. Example

**Student request:**

"I want fewer days on campus, no Friday classes, and afternoon lessons from 1 PM to 6 PM."

**Expected interpretation:**

- Objective: `MINIMIZE_SCHOOL_DAYS`, priority 1.
- Day: `FRI`, `AVOID`, strictness requiring clarification unless specified.
- Time: `13:00–18:00`, `PREFER`, strictness requiring clarification unless specified.

After clarification, Leo presents the full draft for confirmation.

## 5. Backend Person 2 — Integration Requirements

The backend needs to provide authenticated planning-request-scoped operations to:

1. Retrieve existing preferences for a planning request.
2. Save or replace confirmed day preferences.
3. Save or replace confirmed time preferences.
4. Save or replace planning objectives.
5. Generate valid timetable alternatives using the selected courses and available course indexes.
6. Rank feasible alternatives based on soft preferences and optimization objectives.
7. Return generated plans and their validation results.

Existing database tables:

- `planning_day_preference`
- `planning_time_preference`
- `planning_objective`

**Important validation rules:**

- `UNSPECIFIED` must be resolved before database persistence.
- Time ranges must have valid start and end times.
- Only authorized planning requests may be modified.
- The backend must distinguish hard constraints from soft ranking preferences.
- Generated plans must satisfy course eligibility and timetable clash checks.
- If no feasible timetable exists, report that rather than creating an invalid plan.

The exact API routes and request/response formats should be agreed with Backend Person 2 before Leo's persistence and generation tools are implemented.

## 6. Current Limitations

- Preference drafts are not saved as structured records in MySQL.
- Conversational confirmation is not equivalent to a saved planning request.
- Leo does not yet invoke an automatic timetable generator.
- No preference-based plan rankings are available from Leo.
- Draft updates currently depend on the retained conversation context; dedicated structured draft state is not implemented.
- The current website student identity is local-demo-only, not production authentication.

## 7. Next Integration Stage

Once Backend Person 2's APIs are ready:

1. Connect Leo's confirmed preference draft to the appropriate planning request.
2. Add a backend-validated preference-saving AI tool.
3. Add a tool to request generated timetable options A/B/C.
4. Return validated plan summaries through both website and Telegram.
5. Test preference changes, infeasible constraints, unauthorized access and generated-plan correctness.

Leo must never claim that preferences were saved or plans generated unless the corresponding backend operation confirms success.