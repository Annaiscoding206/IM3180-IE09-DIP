# Better STARS Backend API Documentation

## 1. Overview

This document describes the backend APIs currently implemented for the **Better STARS** web application.

The backend is built using:

- Node.js
- Express.js
- MySQL
- mysql2
- CORS
- dotenv

The backend connects to the MySQL database:

```text
stars_companion_db
```

The current Week 5 APIs mainly support the **Course Explorer** and **Course Detail** features.

---

## 2. Base URL

During local development, the API base URL is:

```text
http://localhost:5000/api
```

Example:

```text
http://localhost:5000/api/courses
```

---

## 3. Health Check

### GET `/health`

Checks whether the Express backend server and MySQL database connection are working.

### Request

```http
GET /api/health
```

### Example URL

```text
http://localhost:5000/api/health
```

### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "message": "Backend and database are connected"
}
```

### Error Response

**Status:** `500 Internal Server Error`

```json
{
  "success": false,
  "message": "Database connection failed"
}
```

### Possible Status Codes

| Status | Description |
|---|---|
| `200 OK` | Backend and database are connected |
| `500 Internal Server Error` | Database connection failed |

---

## 4. Get All Courses

### GET `/courses`

Returns all available courses stored in the database.

The API supports optional query parameters for searching and filtering courses.

Each course is returned only once even if it contains multiple indexes.
### Request

```http
GET /api/courses
```

### Example URL

```text
http://localhost:5000/api/courses
```

### Example Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "course_code": "MH1810",
      "course_name": "Mathematics 1",
      "au": 3,
      "grading_type": "LETTER_GRADED",
      "exam_datetime": "2026-11-23T01:00:00.000Z",
      "prerequisite_text": null,
      "restriction_text": null,
      "mutually_exclusive_text": null,
      "bde": 0,
      "gepe": 0,
      "academic_year": "2026-2027",
      "semester": 1
    }
  ]
}
```

### Possible Status Codes

| Status | Description |
|---|---|
| `200 OK` | Courses retrieved successfully |
| `500 Internal Server Error` | Failed to retrieve courses |

---

## 5. Search Courses

### GET `/courses?search={keyword}&au={value}&semester={value}`

Searches and filters courses using optional query parameters.

The current implementation supports:

- Course code search
- Course name search
- Academic unit filtering
- Semester filtering
- Academic year filtering

The backend uses SQL `LIKE` matching for keyword search.

### Request

```http
GET /api/courses?search={keyword}
```

### Example — Search by Course Code

```text
http://localhost:5000/api/courses?search=MH1810
```

### Example — Search by Course Name

```text
http://localhost:5000/api/courses?search=Mathematics
```

### Example Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "course_code": "MH1810",
      "course_name": "Mathematics 1",
      "au": 3,
      "grading_type": "LETTER_GRADED",
      "exam_datetime": "2026-11-23T01:00:00.000Z",
      "prerequisite_text": null,
      "restriction_text": null,
      "mutually_exclusive_text": null,
      "bde": 0,
      "gepe": 0,
      "academic_year": "2026-2027",
      "semester": 1
    }
  ]
}
```

### No Matching Course

If there is no matching course, the request still succeeds and returns an empty array.

```json
{
  "success": true,
  "count": 0,
  "data": []
}
```

### Possible Status Codes

| Status | Description |
|---|---|
| `200 OK` | Search completed successfully |
| `500 Internal Server Error` | Search failed |

---

## 6. Get Course Details

### GET `/courses/:courseCode`

Returns detailed information for one selected course.

This endpoint is used when the user selects a course from the Course Explorer.

### Path Parameter

| Parameter | Description |
|---|---|
| `courseCode` | Course code, for example `MH1810` |

### Request

```http
GET /api/courses/:courseCode
```

### Example URL

```text
http://localhost:5000/api/courses/MH1810
```

### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "course_code": "MH1810",
    "course_name": "Mathematics 1",
    "au": 3,
    "grading_type": "LETTER_GRADED",
    "exam_datetime": "2026-11-23T01:00:00.000Z",
    "prerequisite_text": null,
    "restriction_text": null,
    "mutually_exclusive_text": null,
    "bde": 0,
    "gepe": 0,
    "academic_year": "2026-2027",
    "semester": 1
  }
}
```

### Course Not Found

Example:

```text
http://localhost:5000/api/courses/ABC9999
```

**Status:** `404 Not Found`

```json
{
  "success": false,
  "message": "Course not found"
}
```

### Possible Status Codes

| Status | Description |
|---|---|
| `200 OK` | Course retrieved successfully |
| `404 Not Found` | Course does not exist |
| `500 Internal Server Error` | Failed to retrieve course information |

---

## 7. Get Course Indexes

### GET `/courses/:courseCode/indexes`

Returns all available indexes belonging to a selected course.

This endpoint is used by the Course Detail page to display the available index options.

### Path Parameter

| Parameter | Description |
|---|---|
| `courseCode` | Course code whose indexes should be retrieved |

### Request

```http
GET /api/courses/:courseCode/indexes
```

### Example URL

```text
http://localhost:5000/api/courses/MH1810/indexes
```

### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "course_code": "MH1810",
  "count": 65,
  "data": [
    {
      "index_no": 15091,
      "vacancy": null,
      "vacancy_updated_at": null
    },
    {
      "index_no": 15092,
      "vacancy": null,
      "vacancy_updated_at": null
    }
  ]
}
```

### Course Not Found

Example:

```text
http://localhost:5000/api/courses/ABC9999/indexes
```

**Status:** `404 Not Found`

```json
{
  "success": false,
  "message": "Course not found"
}
```

### Possible Status Codes

| Status | Description |
|---|---|
| `200 OK` | Course indexes retrieved successfully |
| `404 Not Found` | Course does not exist |
| `500 Internal Server Error` | Failed to retrieve course indexes |

---
## 8. Student Eligibility API

### Check Course Prerequisite Eligibility

Checks whether a student is eligible to take a selected course by comparing the course prerequisite requirements with the student's completed courses.

---

### Endpoint

```http
GET /api/students/:studentId/eligibility/:courseCode
---

## 9. API Summary

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check backend and database connection |
| GET | `/api/courses` | Retrieve all courses |
| GET | `/api/courses?search={keyword}&au={value}&semester={value}` | Search and filter courses |
| GET | `/api/courses/:courseCode` | Retrieve detailed information for one course |
| GET | `/api/courses/:courseCode/indexes` | Retrieve indexes for one course |
| GET | `/api/students/:studentId/eligibility/:courseCode` | Check whether a student satisfies course prerequisites |

---

## 10. Current Backend Structure

```text
backend/
│
├── src/
│   ├── config/
│   │   └── db.js
│   │
│   ├── controllers/
│   │   └── courseController.js
│   │
│   ├── routes/
│   │   └── courseRoutes.js
│   │
│   └── server.js
│
├── docs/
│   └── API.md
│
├── .env
├── package.json
└── package-lock.json
```

### File Responsibilities

#### `src/server.js`

Main Express server.

Responsibilities include:

- Loading environment variables
- Enabling CORS
- Parsing JSON requests
- Registering API routes
- Running the backend server
- Providing the health-check endpoint

#### `src/config/db.js`

Creates the MySQL connection pool using `mysql2/promise`.

The database configuration is read from environment variables stored in `.env`.

#### `src/controllers/courseController.js`

Contains the main course-related backend logic.

Current functions include:

- `getCourses`
- `getCourseByCode`
- `getCourseIndexes`

#### `src/routes/courseRoutes.js`

Defines the course-related API routes and connects them to the course controller.

---

## 11. Environment Configuration

Database credentials and configuration are stored in:

```text
backend/.env
```

Example structure:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=stars_companion_db
```

The `.env` file should not be committed to GitHub because it contains local database credentials.

It should be included in `.gitignore`.

Example:

```gitignore
node_modules/
.env
```

---

## 12. Current Limitations

The following functionality is not yet included in the current Course API implementation:
- Corequisite checking
- Programme restriction checking
- Automatic timetable generation
- Timetable clash detection
- Alternative index recommendation
- Live NTU vacancy integration
- AI assistant functionality

These functions will be implemented in later development stages.

---

## 13. Vacancy Data

Some course index records may currently contain:

```json
{
  "vacancy": null,
  "vacancy_updated_at": null
}
```

This is expected because live NTU STARS vacancy information has not yet been integrated into the application.

The current endpoint returns the vacancy information available in the local database.

---

## 14. Error Handling

The current APIs include basic error handling.

### Example — Invalid Course

Request:

```http
GET /api/courses/ABC9999
```

Response:

```json
{
  "success": false,
  "message": "Course not found"
}
```

Status:

```text
404 Not Found
```

### Example — Internal Server Error

If a database query fails, the API returns:

```json
{
  "success": false,
  "message": "Failed to fetch courses"
}
```

Status:

```text
500 Internal Server Error
```

---

## 15. Current Testing

The implemented GET APIs have currently been manually tested using the browser.

The following endpoints have been tested:

```text
GET /api/health

GET /api/courses

GET /api/courses?search=MH1810

GET /api/courses/MH1810

GET /api/courses/MH1810/indexes

GET /api/courses/ABC9999
```

Postman testing has not yet been implemented and can be added later when the backend contains additional `POST`, `PUT`, and `DELETE` APIs.

---

## 16. Week 5 Backend Progress

### Backend Person 1

Completed:

- Express server setup
- Node.js backend project setup
- MySQL database connection
- Environment variable configuration
- Backend health-check API
- Get all courses API
- Course search API
- Course detail API
- Course index API
- Basic error handling
- Manual API testing
- API documentation

### Current API Flow

```text
Frontend / Browser
        |
        v
Express Backend
        |
        +-- GET /api/health
        |
        +-- GET /api/courses
        |
        +-- GET /api/courses?search=...
        |
        +-- GET /api/courses/:courseCode
        |
        +-- GET /api/courses/:courseCode/indexes
        |
        v
MySQL
stars_companion_db
```

---

## 17. Next Backend Development

The next backend development stage can extend the current structure with additional controllers and routes.

Example future structure:

```text
src/
├── config/
│   └── db.js
│
├── controllers/
│   ├── courseController.js
│   ├── studentController.js
│   └── planController.js
│
├── routes/
│   ├── courseRoutes.js
│   ├── studentRoutes.js
│   └── planRoutes.js
│
└── server.js
```

Possible future APIs include:

```text
GET    /api/students/:studentId

PUT    /api/students/:studentId

GET    /api/plans/:studentId

POST   /api/plans

POST   /api/plans/:planId/courses

DELETE /api/plans/:planId/courses/:courseCode
```

These future APIs will support the Student Profile, Selected Courses, Add to Plan, and timetable-planning functions of Better STARS.

---

## 18. Notes for Frontend Integration

The frontend should use these APIs instead of directly accessing the MySQL database.

For example:

```text
Course Explorer
      |
      v
GET /api/courses
```

Searching for a course:

```text
User enters "MH1810"
      |
      v
GET /api/courses?search=MH1810
```

Opening the Course Detail page:

```text
User selects MH1810
      |
      v
GET /api/courses/MH1810
```

Displaying available indexes:

```text
Course Detail
      |
      v
GET /api/courses/MH1810/indexes
```

This keeps the frontend, backend, and database responsibilities separated.

---

## 19. Summary

The Week 5 backend currently provides the foundation required for the Better STARS Course Explorer and Course Detail features.

The implemented backend flow is:

```text
React Frontend
      |
      v
Express REST API
      |
      v
MySQL
stars_companion_db
```

The current APIs allow the application to:

1. Verify that the backend and database are connected.
2. Retrieve available courses.
3. Search courses by course code or course name.
4. Retrieve detailed information for a selected course.
5. Retrieve the available indexes for a selected course.
6. Handle invalid course requests.

Further APIs for student profiles, course selection, plan management, eligibility checking, and timetable generation will build on this backend structure.