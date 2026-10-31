# Leo preference and planning integration

Leo now connects interpretation to the existing planning services. Saved
preferences, eligibility, curriculum progress, clash validation, ranking and
final-selection validity have one backend authority. The model does not implement
these rules or decide whether a database write succeeded.

## Workflow

1. Use `list_planning_requests` to identify the student's intended request.
2. `interpret_timetable_preferences` extracts preferences and an explicitly chosen
   `request_id` (nullable when not yet known).
3. Clarify unspecified strictness or incomplete time ranges. A draft can have
   `no_preferences`, `clarification_required`, or `ready_for_confirmation` status.
4. A bound draft is stored in `ai_preference_draft` for the owned conversation,
   request and a fresh opaque token. This is draft state, **not** saved planning
   preference persistence. New bound drafts supersede the previous token; a bound
   `no_preferences` result clears the pending token without clearing saved rules.
5. The backend renders the exact draft and replacement warning. The student sends
   `CONFIRM <draft_id> FOR REQUEST <request_id>`, optionally followed by
   `AND GENERATE`. The entire current message must match the command. “Okay”,
   quoted text, earlier chat text and model-generated flags do not authorize it.
6. Confirmation locks the request before any plan invalidation, verifies owned
   conversation/draft/request and ready status, invokes the shared preference
   replacement function, marks the draft saved and commits atomically.
7. Optional generation uses the existing generation service in a separate
   transaction. A generation failure leaves successfully confirmed preferences
   saved and exposes the generation error separately. It never auto-finalizes.

Independent generation is `GENERATE REQUEST <id>` or
`GENERATE REQUEST <id> FROM PLAN <source_plan_id>`. If any plan, including archived history, has locked
indexes, the source plan must be explicit. `AND GENERATE` does not infer a source;
use the independent command after confirmation when source selection is needed.

Commands bypass model inference, so an already staged draft can be confirmed
without an external OpenAI call. A token is valid only for its current conversation
and request, and can be saved once. No production authentication system is implied.

## Interpretation and persistence payloads

The model tool input is:

```json
{
  "request_id": 10,
  "day_preferences": [{"day_of_week":"MON","preference_type":"PREFER","constraint_level":"SOFT"}],
  "time_preferences": [{"description":"classes between nine and six","start_time":"09:00","end_time":"18:00","preference_type":"PREFER","constraint_level":"HARD"}],
  "objectives": [{"objective_type":"MINIMIZE_SCHOOL_DAYS","priority":1}],
  "clarification_questions": []
}
```

Days are MON–SUN. Preference type is PREFER/AVOID. Interpretation permits
HARD/SOFT/UNSPECIFIED and nullable time boundaries; persistence permits only
complete valid HARD/SOFT rules. Exact HH:MM boundaries are requested rather than
invented from words such as “morning.” Objectives also support MINIMIZE_GAPS;
positive integer priority 1 has highest weight. Time descriptions are draft-only.
The shared persistence validator rejects duplicates, invalid ranges and extra
fields after the draft adapter extracts the three supported arrays.

Ready output adds `draft_id`, `request_id`, `confirmation_command`,
`requires_student_confirmation:true`, `saved_to_database:false` and
`timetable_generated:false`. Confirmation replaces all saved day/time/objective
arrays; it does not merge silently and never changes blocked periods. Clearing
all saved preferences is supported through the Planner or preference PUT with
three empty arrays; a no-preference interpretation is not a clear command.

HARD PREFER days form a whitelist, not an attendance requirement. HARD PREFER
windows are alternatives, with every class fully inside at least one window.
HARD AVOID excludes matching days/overlapping times. Contradictions remain
infeasible. The model must not weaken rules to obtain a timetable.

## Tools and shared services

| Tool | Shared backend authority |
|---|---|
| `get_student_academic_context` | Profile, Degree Audit or curriculum services; trusted identity only |
| `list_planning_requests` | Owned request list |
| `get_planning_context` | Request, saved preferences/blocks, detailed plans, current active selection |
| `interpret_timetable_preferences` | Existing deterministic draft builder, shared preference validation, durable draft binding |
| `save_confirmed_preferences` | Atomic shared preference replacement after exact current-message authorization |
| `generate_timetable_plans` | Existing generator, shared summary/validation services |
| `get_student_timetable` | Revalidated active plan; requests clarification if more than one request has a valid final timetable |

Existing course and eligibility tools remain available. Trusted identity,
conversation ID and the actual user message are provided in SDK run context, not
model arguments. This follows the SDK's separation of tool arguments and local
[run context](https://developers.openai.com/api/docs/guides/agents/define-agents).

Plan summaries expose indexes, every session, persisted rank/score, current
comparison metrics, full validation and selection state. Saved rank/score can be
null after invalidation. `metrics_scope` says that comparison metrics use current
saved preferences. Stored SELECTED labels alone are insufficient: an active
selection requires current `can_finalize`. Multiple valid selections in one
request return an explicit ambiguity error; multiple matching requests ask the
student for a request ID.

Generation failures preserve the existing structured reasons, evidence and
remedies. `SEARCH_LIMIT_REACHED` is distinct from proven infeasibility. A reason
may describe a rejected candidate or an observed conflict; Leo must not present
sample evidence as a unique root cause or promise a remedy will be feasible.

## Website and Telegram

Both channels call `askSmartStars` and persist through `conversationService`.
`ai_active_conversation` holds a separate shared active conversation per student;
messages retain website/Telegram provenance. Draft tokens survive reloads and
channel switches. A foreign conversation cannot be read or used to save a draft.

The website uses the local demo middleware. The Telegram bot maps only the
configured allowlisted sender to the validated `DEMO_PLANNING_STUDENT_ID`, using
the same resolver as planning and website chat. No student identity is accepted
from a message or model-generated argument. See [active demo identity](ACTIVE_DEMO_IDENTITY.md)
for switching modes, and [setup](SETUP.md) for flags and tokens.

## Verification and limits

`backend/tests/finalIntegration.integration.test.js` exercises live MySQL/HTTP,
actual SDK tool invocation and both channel labels with a substituted model
runner. It checks exact confirmation, unresolved/UNSPECIFIED rejection, ownership,
superseded/replayed tokens, rollback, shared generation, structured failure and
active-plan retrieval. Full regressions run with `--test-concurrency=1` to avoid
shared-database integration deadlocks. No Telegram network delivery or live model
interpretation is claimed by those tests.

Natural-language extraction still depends on model accuracy; the exact displayed
draft and explicit confirmation are the review step. Only the current draft per
conversation is kept. Preferences are full replacement and blocked periods are
managed separately. Save/generate commits and subsequent chat-history writes are
separate transactions: if history/network delivery fails after a planning commit,
reload the saved request/plan before retrying. Confirmations cannot replay a saved
draft; independent generation requests intentionally create a new batch. Calendar
display is weekly, not a date-specific or exam-clash timetable.
