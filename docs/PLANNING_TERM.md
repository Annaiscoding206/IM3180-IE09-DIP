# Planning Term selector

The header selects academic year and Semester 1/2. It does not filter course cards
out of Explorer: availability and index choices follow the selected request.
A year without catalogue offerings is selectable, but its courses cannot be added
and its index pickers are empty. Year options include existing catalogue/request
years and adjacent years, so the control works beyond the current catalogue.
Existing Semester 3 requests can still be displayed; the normal selector offers
Semesters 1 and 2.

## Initial request

1. Restore this student's last successfully loaded request from `sessionStorage`
   if it still appears in the student's owned request list.
2. Otherwise load the most recently updated existing request, then highest request
   ID as a tie-breaker. Future-year requests are not excluded based on today's date.
3. Only if no request exists, resolve/create an empty request using
   `suggestedPlanningTerm` in `frontend/src/planningTerm.js`.

The suggestion uses Asia/Singapore dates. June–November suggests Semester 1 in
that year's AY; December suggests Semester 2 in that same AY; January–May suggests
Semester 2 in the AY starting the previous year. June/July and December intentionally
suggest the upcoming semester. This is a simple configurable heuristic, not a
published NTU academic-calendar calculation. It never runs as a timer, overrides
an existing request, or archives/modifies plans. Users can immediately override it.

## Switching terms

The browser calls the authenticated `POST /api/planning-requests/resolve-term`
with just academic year and semester. The backend loads or creates an owned request
for the exact pair. Repeated/concurrent selector calls reuse a request without a
schema change. If legacy data has multiple requests for a term, the most recently
updated one is chosen; no legacy requests are deleted or combined.

While loading, term controls are disabled and term-scoped views are unmounted.
A successful switch restores plan-specific selections from the request's working
plan, preferring the working plan remembered in this app session, then the active
final plan, then the existing default plan ordering. Planner/Profile are mounted
with the request ID as their key. Explorer refreshes availability/eligibility and
closes detail dialogs. Old responses/callbacks cannot replace the newly selected
request's state. A failed switch restores the previous visible context and displays
an error. Backend term/ownership validation remains authoritative.

Request choice is remembered per student in the current browser session, not as
a global server-side term. Website Leo now sends that request and working plan
with each message; the backend verifies ownership and derives the term from the
request. Planning tools cannot read or write another term by using stale IDs.
A preference draft from another request cannot be saved in the selected term.

Conversation storage and source-channel labels are unchanged. General history
remains available, but browser preference interpretation uses only the current
message and any pending draft bound to the same request (unlabelled older turns
cannot be reused as another term's preferences). Academic history, curriculum
rules and student identity remain unchanged.

Telegram does not inherit the browser's request selection. With no browser
binding it continues using its explicit message/process/session context and the
existing clarification rules. Website/Telegram conversation ownership, channel
provenance and shared-history behaviour are preserved.
