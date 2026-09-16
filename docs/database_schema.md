\# Database Schema



\## 1. Purpose



The database supports the full student planning workflow:



Student Profile

↓

Course Exploration

↓

Eligibility Checking

↓

Course Selection

↓

Timetable Preferences

↓

Timetable Generation

↓

Plan A / B / C

↓

Registration Companion



The database should store course information, student academic data, planning requests, generated timetable plans, and eligibility rules.



\---



\# 2. Course Data



\## course\_info



Stores course and index information.



Primary Key:

\- course\_code

\- index\_no



Main fields:

\- course\_code

\- index\_no

\- course\_name

\- au

\- vacancy

\- prerequisite

\- exemptions / restrictions

\- grading\_type

\- exam\_datetime

\- bde

\- gepe

\- academic\_year

\- semester

\- mutually\_exclusive\_with



Relationship:



course\_info

↓

class\_slots



One course index can have multiple class slots.



\---



\## class\_slots



Stores lecture, tutorial, lab, seminar, or studio timings for each course index.



Primary Key:

\- slot\_id



Foreign Key:

\- (course\_code, index\_no)

&#x20; → course\_info(course\_code, index\_no)



Main fields:

\- slot\_id

\- course\_code

\- index\_no

\- class\_type

\- class\_group

\- day\_of\_week

\- start\_time

\- end\_time

\- venue



\---



\# 3. Student Data



\## student



Stores the student profile used by the planner.



Primary Key:

\- student\_id



Main fields:

\- student\_id

\- programme

\- study\_year



Example:



DEMO001

Programme: IEM

Year: 3



\---



\## completed\_course



Stores courses already completed by a student.



Primary Key:

\- student\_id

\- course\_code



Foreign Key:

\- student\_id

&#x20; → student(student\_id)



Main fields:

\- student\_id

\- course\_code



Example:



DEMO001 → MH1810

DEMO001 → IE2110

DEMO001 → IE2108



This table is used by the eligibility checker.



\---



\# 4. Planning Request



\## planning\_request



Represents one semester-planning request created by a student.



A planning request exists before Plan A / B / C are generated.



Example:



Student wants:

\- 18 AU

\- no Friday classes

\- avoid morning classes

\- maximum 4 school days

\- minimize gaps



Primary Key:

\- request\_id



Foreign Key:

\- student\_id

&#x20; → student(student\_id)



Main fields:

\- request\_id

\- student\_id

\- target\_au

\- earliest\_time

\- latest\_time

\- max\_school\_days

\- avoid\_morning

\- minimize\_gaps

\- prefer\_afternoon

\- created\_at



Relationship:



student

↓

planning\_request

↓

generated plans



One student can create multiple planning requests## planning\_request



Represents one semester-planning request created by a student.



A planning request exists before Plan A / B / C are generated.



Example:



Student wants to plan:

\- AY2026/27 Semester 1

\- approximately 18 AU



Preferences such as preferred days, avoided times and optimization goals are stored in separate preference tables rather than as fixed columns here.



Primary Key:

\- request\_id



Foreign Key:

\- student\_id

&#x20; → student(student\_id)



Main fields:

\- request\_id

\- student\_id

\- academic\_year

\- semester

\- target\_au

\- created\_at

\- updated\_at



Relationship:



student

↓

planning\_request

↓

selected courses + preferences

↓

generated plans



\---



\## planning\_request\_course



Stores courses selected by the student before timetable generation.



Primary Key:

\- request\_id

\- course\_code



Foreign Keys:

\- request\_id

&#x20; → planning\_request(request\_id)



Main fields:

\- request\_id

\- course\_code



Example:



Request 1:

\- IE3014

\- IE3102

\- MH1811



At this stage, the student selects courses but does not need to select indexes yet.



The timetable generator chooses suitable indexes later.



\---



\## planning\_day\_preference



Stores preferred or avoided days for a planning request.



Primary Key:

\- day\_preference\_id



Foreign Key:

\- request\_id

&#x20; → planning\_request(request\_id)



Main fields:

\- day\_preference\_id

\- request\_id

\- day\_of\_week

\- preference\_type

\- constraint\_level



preference\_type:

\- PREFER

\- AVOID



constraint\_level:

\- HARD

\- SOFT



Examples:



No Friday:

Request 1 → FRI → AVOID → HARD



Prefer Wednesday free if possible:

Request 1 → WED → AVOID → SOFT



Prefer Monday:

Request 1 → MON → PREFER → SOFT



\## planning\_time\_preference



Stores preferred or avoided time ranges.



Primary Key:

\- time\_preference\_id



Foreign Key:

\- request\_id

&#x20; → planning\_request(request\_id)



Main fields:

\- time\_preference\_id

\- request\_id

\- start\_time

\- end\_time

\- preference\_type

\- constraint\_level



preference\_type:

\- PREFER

\- AVOID



constraint\_level:

\- HARD

\- SOFT



Examples:



Avoid morning classes:

08:30–12:00 → AVOID → SOFT



Cannot attend before 10 AM:

08:00–10:00 → AVOID → HARD



Prefer afternoon classes:

12:00–18:00 → PREFER → SOFT



\## planning\_objective



Stores timetable optimization objectives.



Primary Key:

\- objective\_id



Foreign Key:

\- request\_id

&#x20; → planning\_request(request\_id)



Main fields:

\- objective\_id

\- request\_id

\- objective\_type

\- priority



Examples of objective\_type:

\- MINIMIZE\_GAPS

\- MINIMIZE\_SCHOOL\_DAYS



priority determines the relative importance of the objective.



Example:



Request 1:

MINIMIZE\_SCHOOL\_DAYS → priority 1

MINIMIZE\_GAPS → priority 2

\---



\# 5. Generated Timetable Plans



\## plan



Stores timetable alternatives generated from a planning request.



Primary Key:

\- plan\_id



Foreign Key:

\- request\_id

&#x20; → planning\_request(request\_id)



Main fields:

\- plan\_id

\- request\_id

\- plan\_name

\- rank\_no

\- match\_score

\- status

\- created\_at



Example:



Planning Request 1

↓

Plan A — Best Match

Plan B — Most Compact

Plan C — Alternative



One planning request can generate multiple plans.



\---



\## plan\_course



Stores the selected course index used in each generated timetable plan.



Primary Key:

\- plan\_course\_id



Foreign Keys:

\- plan\_id

&#x20; → plan(plan\_id)



\- (course\_code, index\_no)

&#x20; → course\_info(course\_code, index\_no)



Main fields:

\- plan\_course\_id

\- plan\_id

\- course\_code

\- index\_no

\- locked



Unique Constraint:

\- one course should appear only once in the same plan



Example:



Plan A:

\- IE3014 → Index 32423

\- IE3102 → Index 32442

\- MH1811 → Index 50005



The locked field supports the future feature where a student keeps one index fixed and regenerates the rest of the timetable.



Timetable day/time information should NOT be duplicated here because it can be retrieved from class\_slots.



\---



\# 6. Eligibility Rules



\## course\_requirement



Stores prerequisite and corequisite rules used by the eligibility checker.



Primary Key:

\- requirement\_id



Main fields:

\- requirement\_id

\- course\_code

\- required\_course\_code

\- requirement\_type

\- requirement\_group



requirement\_type:

\- PREREQUISITE

\- COREQUISITE



requirement\_group supports OR conditions.



Example:



If SC5002 requires:



SC1003 OR SC5001 OR CV1014



the three courses can belong to the same requirement group.



The original prerequisite text may still remain in course\_info for display purposes.



\---



\## programme\_restriction



Stores programme restrictions for courses.



Primary Key:

\- restriction\_id



Main fields:

\- restriction\_id

\- course\_code

\- programme

\- cohort

\- restriction\_type



Example:



SC5002

→ IEM

→ NOT\_AVAILABLE



This allows the system to show:



"Not available to your programme."



\---



\## mutual\_exclusion



Stores mutually exclusive course relationships.



Primary Key:

\- exclusion\_id



Main fields:

\- exclusion\_id

\- course\_code

\- excluded\_course\_code



Example:



Course A cannot be taken together with Course B.



\---



\# 7. Main Relationships



Student side:



student

├── completed\_course

└── planning\_request

&#x20;     ├── planning\_request\_course

&#x20;     ├── planning\_day\_preference

&#x20;     ├── planning\_time\_preference

&#x20;     ├── planning\_objective

&#x20;     └── plan

&#x20;           └── plan\_course

Course side:



course\_info

└── class\_slots



Planning connection:



plan\_course

↓

course\_info

↓

class\_slots



Eligibility:



course\_info

├── course\_requirement

├── programme\_restriction

└── mutual\_exclusion



\---



\# 8. User Flow → Database Mapping



\## Student Profile



Requires:

\- student

\- completed\_course



\## Course Explorer



Requires:

\- course\_info

\- class\_slots



\## Eligibility Check



Requires:

\- student

\- completed\_course

\- course\_requirement

\- programme\_restriction

\- mutual\_exclusion



\## Selected Courses



Requires:

\- planning\_request

\- planning\_request\_course



\## Preferences



Requires:

\- planning\_request

\- planning\_day\_preference

\- planning\_time\_preference

\- planning\_objective



\## Plan A / B / C



Requires:

\- plan

\- plan\_course



\## Timetable Display



Requires:



plan\_course

↓

course\_info

↓

class\_slots



\## Registration Companion



Requires:

\- plan

\- plan\_course

\- course\_info.vacancy



\---



\# 9. Important Design Decisions



1\. Keep the existing course\_info and class\_slots structure for the current prototype to avoid unnecessary migration of working course data.



2\. Use one unified application database: stars\_companion\_db.



3\. planning\_request represents the student's semester-planning session before timetable generation.



4\. Courses are selected first through planning\_request\_course; indexes are selected later by the timetable generator.



5\. Plan A / B / C are generated from the same planning\_request.



6\. Store day and time preferences in generic preference tables instead of fixed fields such as avoid\_morning or prefer\_afternoon.



7\. Distinguish HARD constraints from SOFT preferences.



8\. Store optimization goals separately in planning\_objective.



9\. Do not duplicate weekday/time information inside plan\_course because class schedule data already exists in class\_slots.



10\. Use course\_code and index\_no consistently across planning and course data.



11\. Keep legacy SQL files until the unified database has been successfully migrated and tested.

