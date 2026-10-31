# EEE demo profile

Run `node scripts/setupDemo002.cjs` from `backend` against the existing
`stars_companion_db`. Required Degree Audit, curriculum and independent-plan
tables must already exist. This command does not run migrations, historical
seeds or catalogue imports.

`database/demo002_profile.json` owns the synthetic DEMO002 identity, a partial
EEE AY2025 NORMAL_ENTRY curriculum, and twelve PASSED Year 1 attempts (28 AU).
The name “Demo EEE Student” is a demo label, not a real person's identity.
Grades are unknown. Academic years/semesters are explicitly supplied synthetic
history. No legacy completed_course rows or planning requests are created.
The app's demo planning term remains AY2026/2027 Semester 1.

Setup is atomic and serialized by a database advisory lock. Existing conflicting
identity, curriculum or academic data causes rollback rather than replacement.
Identical reruns do not update timestamps or invalidate existing plans. Runtime
completion and eligibility still use the existing backend services. The setup
reuses their transaction-aware import helpers and request-before-plan lock order.
It does not reset a student who has subsequently progressed to another study year.

## Partial curriculum and evidence

The seed contains 25 named Year 1–2 requirements: CORE 48 AU, ICC 17 AU
(common core 14 and professional series 3), plus a generic BDE category requiring
6 AU for Year 1. The two BDE choices are unknown: there are no fictitious BDE
course codes or academic records. The existing empty category correctly shows
0 completed / 6 remaining AU and requirements_satisfied=false. Future BDE credit
requires mapping verified actual course choices into this curriculum first.

The partial curriculum totals 71 AU, with 28 completed and 43 remaining on first
setup. This is not the full EEE graduation requirement. Service learning,
Years 3–4, full-degree elective totals, FYP credit and the professional-preparation
course code remain out of scope. Academic completion does not infer current
enrolment, term availability, prerequisites, exemptions or minimum study years.

Semester placement comes from the user's AY2025 non-direct-entry curriculum
transcription. The official references in the JSON corroborate modules but are
not the exact cohort schedule. Recommendations remain advisory. IE0005 is mapped
to the ICC professional-series group. All data remains explicitly marked demo;
the profile title identifies the curriculum as partial.

Curriculum requirements and academic attempts have no catalogue foreign key.
Missing offerings do not require invented course_info/index/class_slots rows.
Their completion is still shown; eligibility returns COURSE_NOT_IN_CATALOGUE,
eligible=null and can_select=false until verified catalogue data is imported.

At implementation verification, only MH1810, MH1811, IE2108 and IE2110 from this
curriculum exist in the local catalogue. The later catalogue task must verify
EG1001, FE1073, IE1005, PH1011, CC0001, EE1071, EE1102, CC0003, CC0015, IE0005,
EE2101, EE2103, IE2104, IE2106, ML0004, CC0006, EE2005, EE2073, EE2102, IE2107
and CC0007 before adding real offerings. Curriculum placement is not evidence
that a course is offered in the current planning term.

## Active demo identity

The default active demo identity remains DEMO001. To use DEMO002 throughout the
website, including Leo, start the backend from `backend` with:

```sh
DEMO_PLANNING_ENABLED=true DEMO_CHAT_ENABLED=true DEMO_PLANNING_STUDENT_ID=DEMO002 npm start
```

The environment setting is server-controlled and allowlisted to DEMO001/DEMO002;
it cannot be selected by a URL, JSON body or identity header. Existing production,
loopback and Origin checks still apply. Invalid or missing configured students
fail closed. The browser discovers the identity through `GET /api/students/current`.

Then use the existing endpoints:

- `GET /api/students/DEMO002`
- `GET /api/students/DEMO002/degree-audit`
- `GET /api/students/DEMO002/curriculum/progress`
- `GET /api/students/DEMO002/eligibility/IE2110`

Switch back with `DEMO_PLANNING_STUDENT_ID=DEMO001`. Restart the backend and reload
the browser after changing the setting. Restart a running Telegram bot with the
same setting too; shell environment overrides do not propagate between processes.
Do not change DEMO001's database identity to impersonate DEMO002. An externally
authenticated identity still takes precedence over the local demo fallback.

No profile-switching UI was added. Explorer, Planner, StudentProfile and export
wait for identity bootstrap. The same StudentProfile component serves both users.
Website Leo and the approved Telegram sender use the same server-side resolver.
See [identity architecture and audit](ACTIVE_DEMO_IDENTITY.md) for security and
the distinction between Telegram sender authentication and demo student mapping.
