# Historical catalogue extension

Run `cd backend && node scripts/setupCatalogue.cjs` after the existing setup
extensions. This imports the explicit snapshot bundle: the existing
`database/catalogue/2026_1_ie2108_ie2110.json` plus
`2026_1_eee_foundation.json`, `2026_2_eee_foundation.json`,
`2026_1_eee_core.json` and `2026_2_eee_core.json` in that directory,
without rerunning the original course SQL dump. The importer is offline;
reruns do not silently switch to NTUMods' latest semester.

## Provenance and exact scope

Retrieved 2026-10-30 from the historical module pages
[IE2108](https://ntumods.com/mods/IE2108/2026/1) and
[IE2110](https://ntumods.com/mods/IE2110/2026/1), plus the
[2026_1 indexes](https://ntumods.com/data/api/indexes/2026_1.json) and
[2026_1 exams](https://ntumods.com/data/api/exams/2026_1.json).
The snapshot contains source URLs, SHA-256 hashes of the retrieved bodies,
the selected index objects (including group, day, time, venue, remarks
and duration), and the original exam objects. Original blank remarks are retained
in `source_remarks` when supplemented by user-confirmed weeks. Module display metadata was
transcribed from those historical pages. Format reference:
[API](https://ntumods.com/developers/api), [data](https://ntumods.com/developers/data).

| Course | AU | Indexes | Slots | Exam start (Singapore local time) |
|---|---|---|---|---|
| IE2108 — Data Structures & Algorithms in Python | 3 | 32261–32269, 37527–37528 | 22 (lecture + tutorial per index) | 2026-12-02 13:00 |
| IE2110 — Signals & Systems | 3 | 32391–32401 | 11 (tutorial only) | 2026-11-24 13:00 |

For IE2108/IE2110, term is `2026-2027`, semester `1`; no Semester 2 records are
imported for these two courses. The source supplies no IE2110 lecture slots,
and all 33 source slots have blank remarks. The project owner subsequently
confirmed `1-13` for those 33 slots (22 IE2108, 11 IE2110). These supplemental
values are stored separately from the original blank `source_remarks` provenance.
Actual source start/end times are used, not rounded `duration` grid units.
Exam end times and original duration remain in the snapshot because the schema
stores only exam start. Vacancies are unknown and remain NULL, not zero.

The historical pages do not publish grading type. The project owner subsequently
confirmed both courses are Letter Graded; the snapshot records this supplementary
provenance and uses `LETTER_GRADED`. The importer fills only NULL grading values
for matching snapshot indexes; it refuses conflicting known grading or metadata.
Course Explorer displays “Letter Graded”. Extension 15 retains support for
unpublished grading in future snapshots; no further schema change is needed.

## Eligibility and curriculum boundaries

Both historical pages label the courses CORE. Two global `course_type` CORE
rows are added. That table has no programme/cohort dimension. The existing IEM
2024 DIRECT_ENTRY curriculum is synthetic: it includes IE2110 as CORE and omits
IE2108. These pages do not establish the official mapping for that admission
route/cohort. No curriculum requirements, totals, MPE/BDE/ICC mappings, or
programme-specific eligibility rules are inferred or changed.

IE2108's historical page lists SC5001 as mutually exclusive and excludes the
listed REP programmes. These are retained in the existing display/reference
text columns. Neither historical page publishes prerequisites; IE2110's
historical page has no exclusion or restriction metadata. NULL text here means
unpublished, not proof of unrestricted enrolment. The current `/api/modules/IE2110`
response includes prerequisites for its **latest Semester 2** offering; those
are deliberately not imported into Semester 1.

Per the requested scope, no `course_requirement`, `programme_restriction` or
`mutual_exclusion` rows are added. Existing IE2108→SC5002 and IE2110→IE3014
prerequisite alternatives remain unchanged. Consequently IE2108's published
SC5001 exclusion/REP restriction is **display metadata, not enforced by this
extension**. A separately reviewed structured-rule import would be needed to
enforce them. Eligibility still comes entirely from the existing backend;
DEMO001's passed courses remain non-selectable.

## Preservation and conflicts

Imports serialize using a database advisory lock and use one data transaction.
They insert missing `course_info`, `course_type` and `class_slots` rows and enrich
NULL grading from the snapshot. Unspecified teaching weeks can also be enriched
when exactly one snapshot slot matches type, group, day, times and venue. Explicit
weeks cannot be overwritten or erased; ambiguous matches and duplicate slots
cause rollback. Other existing metadata must match. Existing
vacancy updates, slot IDs, academic records/AU, legacy completions, requests,
plans, chosen indexes, locks, selections, preferences and blocks are untouched.

The current course/index primary key does not include the term. Reusing a key
for a different semester is rejected, never overwritten. This scoped extension
is not a general multi-semester catalogue redesign. The course detail API lists
indexes with their terms; the standalone index list supplies index numbers.
The course list API retains explicit year/semester filters. Without those
filters, Explorer shows every course and uses planning context to report term
availability separately from eligibility.

## Six-course AY2026/2027 extension

Retrieved 2026-10-31 from the bulk [module catalogue](https://ntumods.com/data/api/modules.json)
and historical [Semester 1 indexes](https://ntumods.com/data/api/indexes/2026_1.json)
and [Semester 2 indexes](https://ntumods.com/data/api/indexes/2026_2.json).
Each new snapshot records source hashes, original module objects and index
objects. Module titles and AU come from the module catalogue; term-specific
indexes, day/time, venues and explicit teaching-week remarks come from that
term's index dataset. User-confirmed supplements are marked separately, with
original blank remarks retained in `source_remarks`. All six modules are 3 AU.

| Course | Semester 1 indexes / slots | Semester 2 indexes / slots |
|---|---:|---:|
| IE1005 — From Computational Thinking to Programming | 19 / 57 | absent |
| IE0005 — Introduction to Data Science & Artificial Intelligence | 4 / 8 | 20 / 60 |
| IE2104 — Digital Electronics | 15 / 30 | 5 / 21 |
| IE2106 — Engineering Mathematics I | 21 / 42 | 2 / 8 |
| EE2101 — Circuit Analysis | 18 / 54 | 5 / 21 |
| EE2102 — Analog Electronics | 9 / 27 | 14 / 70 |
| Total | 86 / 218 | 46 / 180 |

There are 132 new course/index rows and 398 class-slot rows. None of these six
courses reuses an index across the two snapshots. The setup command prevalidates
the entire bundle and rejects duplicate course/index keys before any import.
Each snapshot uses the existing atomic import transaction; reruns are idempotent.

The project owner confirmed `LETTER_GRADED` for all 132 indexes and `1-13` for
the 109 formerly unspecified teaching-week values: 30 IE2104, 42 IE2106,
19 EE2101 and 18 EE2102 Semester 1 slots. These values are supplementary user
confirmation, not claims about what NTUMods published. All 398 slots now have
teaching weeks; the 289 explicit source values remain unchanged. All slots
publish days, times and venues (including ONLINE where provided).
Vacancy and exam dates are not supplied by this scoped import and stay NULL.

No global course_type rows or structured eligibility rules are added. Categories
and programme-restriction strings in the bulk module objects are retained only
as source evidence; they are not programme/cohort curriculum mappings. Runtime
prerequisite, restriction and exclusion text fields remain NULL for these new
rows. NULL is not proof of unrestricted enrolment. Neither DEMO_IEM_2024_DIRECT_V1
nor DEMO_EEE_2025_NORMAL_V1 is changed. IE2108/IE2110 retain their original
metadata and sessions apart from the approved grading/week enrichment above.
All eight courses now have known weeks for all 431 imported slots.
Apart from the approved catalogue grading/week enrichment,
all existing catalogue, academic, planning, preference and chat rows are preserved.

## Three-course EEE core extension

The two `2026_*_eee_core.json` snapshots reuse the verified bulk module and
historical index datasets above. They add only EE2103, EE2005 and IE2107, all
3 AU. EE2073 remains excluded: its PRJ sessions cannot be represented by the
existing class-type enum. No schema or class-type mapping changes are made.

| Course | Semester 1 indexes / slots | Semester 2 indexes / slots |
|---|---:|---:|
| EE2103 — Semiconductor Fundamentals | 20 / 40 | 7 / 31 |
| EE2005 — Electrical Devices & Machines | 7 / 10 | 17 / 34 |
| IE2107 — Engineering Mathematics II | 9 / 18 | 22 / 88 |
| Total | 36 / 68 | 46 / 153 |

No course/index pair collides between terms or with the existing catalogue.
The batch adds 82 index rows and 221 slots. Grading is LETTER_GRADED by user
confirmation. The 65 blank Semester 1 week values use the confirmed 1-13 default
(EE2103: 40, EE2005: 7, IE2107: 18), retaining blank `source_remarks` for provenance.
The other 156 explicit source week values are preserved. Days, times, class types
and venues are all supplied by the source. EE2005 has no published lecture slots
in either dataset and only tutorial slots in Semester 2; no sessions are invented.

Vacancy, exam dates and prerequisite/restriction/exclusion import fields remain
NULL. Bulk source categories/restrictions are retained as evidence only, without
global course-type or curriculum changes. All existing records remain unchanged.

The Semester 1 completion snapshot `2026_1_legacy_completion.json` adds only
IE4758 index 37545 (one lecture session). It reuses the existing course metadata
and mappings and the verified historical timetable. See
[the complete 21-course audit](SEMESTER1_CATALOGUE_AUDIT.md) for counts and preserved
legacy venue/week representation differences. No Semester 2 records are changed.
