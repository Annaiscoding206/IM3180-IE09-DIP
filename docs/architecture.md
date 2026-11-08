\# Technical Architecture



\## 1. System Purpose



The project is a smart course-planning companion for NTU students.



The application helps students:

\- view their academic profile and completed courses

\- explore courses

\- check course eligibility

\- select courses for the semester

\- specify timetable preferences

\- generate clash-free timetable options

\- compare Plan A / B / C

\- prepare alternative indexes before registration



The application does not replace STARS. STARS remains the official course-registration platform.



\---



\## 2. Technology Stack



\### Frontend

\- React

\- Vite

\- React Router



\### Backend

\- Node.js

\- Express



\### Database

\- MySQL

\- mysql2 for Node.js–MySQL communication



\### Configuration

\- dotenv for environment variables



\### UI/UX

\- Figma

\- Figma Make for UI reference/prototyping



\### Version Control

\- Git

\- GitHub



\---



\## 3. System Architecture



User

↓

React + Vite Frontend

↓

REST API

↓

Node.js + Express Backend

↓

mysql2

↓

MySQL Database



The frontend is responsible for the student-facing interface.



The backend handles:

\- database access

\- eligibility logic

\- clash detection

\- timetable generation

\- timetable preference scoring

\- alternative-index recommendation



MySQL stores:

\- course and index data

\- class schedules

\- student academic information

\- planning requests

\- generated timetable plans



\---



\## 4. Main User Flow



Student Profile

↓

Course Explorer

↓

Eligibility Check

↓

Course Selection

↓

Timetable Preferences

↓

Timetable Generation

↓

Plan A / Plan B / Plan C

↓

Preferred Plan

↓

Registration Companion

↓

STARS



\---



\## 5. Repository Structure



IM3180-IE09-DIP/

├── frontend/

├── backend/

├── database/

│   ├── 01\_schema.sql

│   ├── 02\_course\_data.sql

│   ├── 03\_demo\_data.sql

│   └── legacy/

├── docs/

│   ├── architecture.md

│   ├── database\_schema.md

│   └── git-workflow.md

├── .gitignore

└── README.md
