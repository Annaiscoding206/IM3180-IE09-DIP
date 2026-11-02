import { createPlanningContextLoader } from "./planningContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import Planner from "./Planner";
import ReasonDialog from "./ReasonDialog";
import { courseProblem } from "./reasonUtils";
import "./styles.css";
import ChatWidget from "./components/ChatWidget";
import ExportPlan from "./ExportPlan";
import StudentProfile from "./StudentProfile";

const statusLabels = {
  completed: "Completed",
  planned: "Planned",
  eligible: "Eligible",
  "not-yet": "Not yet eligible",
  review: "Review required",
};

const courseTypeLabels = {
  CORE: "Core",
  MPE: "MPE",
  BDE: "BDE",
};

function Icon({ name }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    book: (
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
    ),
    moon: (
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z" />
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      {paths[name]}
    </svg>
  );
}

const initials = (name = "Demo Student") =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const displayYear = (value = "2026-2027") =>
  value.replace("-", "–");

const eligibilityText = (course) => {
  if (course.status === "completed") {
    return "Credit recorded in the student database";
  }

  if (!course.eligibility) {
    return "Eligibility check unavailable";
  }

  if (course.eligibility.eligible) {
    return "All eligibility checks passed";
  }

  return course.eligibility.message;
};

const courseStatus = (course, selectedCodes, completedCodes) => {
  if (completedCodes.has(course.course_code)) return "completed";
  if (selectedCodes.includes(course.course_code)) return "planned";
  if (course.eligibility?.requires_review) return "review";

  return course.eligibility?.eligible ? "eligible" : "not-yet";
};

const formatGradingType = (value) => value === "LETTER_GRADED" ? "Letter Graded" : value ?? "Grading not published";
const availabilityMessage = course => course.available_for_planning_term === false
  ? `Not offered in Semester ${course.planning_term.semester} (AY ${displayYear(course.planning_term.academic_year)})`
  : "";

const formatSlot = (slot) =>
  `${slot.day_of_week} ${String(slot.start_time).slice(0, 5)}–${String(
    slot.end_time
  ).slice(0, 5)} · ${slot.class_type}${
    slot.venue ? ` · ${slot.venue}` : ""
  }`;
const choosePlannerPlan = (plans, preferredId = null) => {
  const available = plans.filter(
    (plan) => plan.status !== "ARCHIVED"
  );

  const preferred = available.find(
    (plan) => Number(plan.plan_id) === Number(preferredId)
  );

  const latestGeneratedA = available
    .filter((plan) => /^AUTO Plan A #\d+$/.test(plan.plan_name))
    .sort(
      (a, b) =>
        Number(b.plan_name.match(/#(\d+)$/)[1]) -
        Number(a.plan_name.match(/#(\d+)$/)[1])
    )[0];

  return preferred || latestGeneratedA || available[0] || null;
};

function App({ studentId }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light"
  );

  const [courses, setCourses] = useState([]);
  const [student, setStudent] = useState(null);
  const [planningRequest, setPlanningRequest] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [workingPlanId, setWorkingPlanId] = useState(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const contextLoader = useRef(createPlanningContextLoader(api));
  const contextKey = useRef(null);
  const workingPlanRef = useRef(workingPlanId);
  workingPlanRef.current = workingPlanId;
  const detailGeneration = useRef(0);
  // Invalidate immediately during a context render, before effects run.
  const nextContextKey = `${studentId}:${workingPlanId}:${planningRequest?.request_id}:${selectionRevision}`;
  if (contextKey.current !== nextContextKey) {
    contextLoader.current.invalidate();
    contextKey.current = nextContextKey;
  }
  const refreshSelectionContext = () => {
    contextLoader.current.invalidate();
    setSelectionRevision(value => value + 1);
  };
  const [page, setPage] = useState(() => {
  return sessionStorage.getItem("smart-stars-page") || "explorer";});
  useEffect(() => {
  sessionStorage.setItem("smart-stars-page", page);}, [page]);
  const [savingCourse, setSavingCourse] = useState(false);
  const [actionError, setActionError] = useState("");
  const [contextError, setContextError] = useState("");
  const [reasonProblem, setReasonProblem] = useState(null);

  const [query, setQuery] = useState("");
  const [au, setAu] = useState("All AU values");
  const [courseType, setCourseType] = useState("All course types");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [activeCourse, setActiveCourse] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem("smart-stars-theme", theme);
    } catch {
      // Storage may be unavailable.
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [studentData, courseData, requests] =
          await Promise.all([
            api.student(studentId),
            api.courses(),
            api.planningRequests(studentId),
          ]);

        const now = new Date();

        const currentAcademicYear =
          now.getFullYear() - (now.getMonth() < 7 ? 1 : 0);

        const requestSummary =
          [...requests]
            .filter((request) => {
              const startYear = Number(
                String(request.academic_year).slice(0, 4)
              );

              return Number.isInteger(startYear) &&
                startYear <= currentAcademicYear;
            })
            .sort((a, b) =>
              String(b.academic_year).localeCompare(String(a.academic_year)) ||
              Number(b.semester) - Number(a.semester) ||
              Number(b.request_id) - Number(a.request_id)
            )[0] ?? requests[0] ?? null;

        const requestDetail = requestSummary
          ? await api.planningRequest(requestSummary.request_id)
          : null;
        const availablePlans = requestDetail
          ? await api.plans(requestDetail.request_id)
          : [];

        const activeSelection =
          requestDetail && availablePlans.length
            ? await api.activePlan(requestDetail.request_id)
            : null;

        const initialPlan = choosePlannerPlan(
          availablePlans,
          activeSelection?.plan?.plan_id
        );

        const initialCodes = initialPlan
          ? (await api.planSelectedCourses(initialPlan.plan_id))
              .map((row) => row.course_code)
          : [];
        if (!cancelled) {
          setStudent(studentData);
          setPlanningRequest(requestDetail);
          setWorkingPlanId(initialPlan?.plan_id ?? null);
          setSelectedCodes(initialCodes);

          setCourses(
            courseData.map((course) => ({
              ...course,
              eligibility: null,
            }))
          );

        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError.message || "Could not load database data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [studentId, loadRevision]);

  useEffect(() => {
    if (loading || !student) return;
    setCourses(current => current.map(course => ({ ...course, eligibility: null, curriculum_status: null,
      available_for_planning_term: null, planning_term: null })));
    detailGeneration.current++;
    setActiveCourse(null);
    setContextError("");
    contextLoader.current.load(studentId, workingPlanId,
      ({ courses: refreshed }) => setCourses(refreshed),
      error => setContextError(error.message || "Could not refresh planning context."), planningRequest?.request_id);
    return () => contextLoader.current.invalidate();
  }, [studentId, loading, student, workingPlanId, planningRequest?.request_id, selectionRevision]);

  const completedCodes = useMemo(
    () => new Set(student?.completed_courses || []),
    [student]
  );

  const selected = courses.filter((course) =>
    selectedCodes.includes(course.course_code)
  );

  const selectedAu = selected.reduce(
    (sum, course) => sum + Number(course.au),
    0
  );

  const targetAu = Number(planningRequest?.target_au) || 15;

  const auValues = [
    ...new Set([
      1,
      2,
      3,
      ...courses.map((course) => Number(course.au)),
    ]),
  ].sort((a, b) => a - b);

  const visibleCourses = useMemo(() => {
    const search = query.trim().toLowerCase();

    return courses.filter(
      (course) =>
        (!search ||
          `${course.course_code} ${course.course_name}`
            .toLowerCase()
            .includes(search)) &&
        (au === "All AU values" ||
          Number(course.au) === Number(au)) &&
        (courseType === "All course types" ||
          course.course_types?.includes(courseType))
    );
  }, [courses, query, au, courseType]);

  const cannotAdd = course => course.available_for_planning_term === false ||
    (planningRequest != null && (course.planning_term == null ||
      course.planning_term.academic_year !== planningRequest.academic_year ||
      Number(course.planning_term.semester) !== Number(planningRequest.semester))) ||
    course.eligibility == null || course.eligibility.can_select === false ||
    completedCodes.has(course.course_code);

  // Course Explorer and My Planner share backend selections.
  const changeCourse = async (code, removing = false) => {
    if (savingCourse) return;

    setSavingCourse(true);
    setActionError("");

    try {
      let requestId = planningRequest?.request_id;

      if (!requestId) {
        if (removing) return;

        const course = courses.find(
          (item) => item.course_code === code
        );

        if (!course) {
          throw new Error("Course not found in the catalogue.");
        }

        const created = await api.createPlanningRequest({
          student_id: studentId,
          academic_year: course.academic_year,
          semester: Number(course.semester),
        });

        requestId = created.request_id;
        setPlanningRequest(created);
      }

      let planId = workingPlanId;

      if (!planId) {
        const availablePlans = await api.plans(requestId);

        let chosenPlan = choosePlannerPlan(availablePlans);

        if (!chosenPlan) {
          let number = 1;

          while (
            availablePlans.some(
              (plan) => plan.plan_name === `Plan ${number}`
            )
          ) {
            number++;
          }

          chosenPlan = await api.createPlan(
            requestId,
            `Plan ${number}`
          );
        }

        planId = chosenPlan.plan_id;
        workingPlanRef.current = planId;
        setWorkingPlanId(planId);
      }

      contextLoader.current.invalidate();
      if (removing) {
        await api.removePlanSelectedCourse(planId, code);
      } else {
        await api.addPlanSelectedCourse(planId, code);
      }

      const stored = await api.planSelectedCourses(planId);

      if (workingPlanRef.current === planId) setSelectedCodes(
        stored.map((item) => item.course_code)
      );

      refreshSelectionContext();
      return true;
    } catch (changeError) {
      refreshSelectionContext();
      setActionError(changeError.message);
      throw changeError;
    } finally {
      setSavingCourse(false);
    }
  };

  const toggleCourse = async (course) => {
    const removing = selectedCodes.includes(course.course_code);
    if (!removing && cannotAdd(course)) return;

    if (
      !removing &&
      completedCodes.has(course.course_code)
    ) {
      setReasonProblem(
        courseProblem(
          course.course_code,
          null,
          course.eligibility,
          completedCodes.has(course.course_code)
        )
      );

      return;
    }

    try {
      await changeCourse(course.course_code, removing);
    } catch (changeError) {
      if (!removing) {
        setReasonProblem(
          courseProblem(course.course_code, changeError)
        );
      }
    }
  };

  const clearFilters = () => {
    setQuery("");
    setAu("All AU values");
    setCourseType("All course types");
  };

  const openDetails = async (course) => {
    const detailToken = ++detailGeneration.current;
    const requestedPlan = workingPlanId;
    const isCurrent = () => detailToken === detailGeneration.current && requestedPlan === workingPlanRef.current;
    setActiveCourse({ ...course, indexes: null });
    setDetailLoading(true);

    try {
      const detail = await api.course(course.course_code, workingPlanId, planningRequest?.request_id);

      const indexes = await Promise.all(
        detail.indexes.map(async (index) => {
          try {
            const slots = await api.timetable(
              detail.course_code,
              index.index_no
            );

            return { ...index, slots };
          } catch {
            return { ...index, slots: [] };
          }
        })
      );

      if (isCurrent()) setActiveCourse({ ...course, ...detail, indexes });
    } catch (detailError) {
      if (isCurrent()) setActiveCourse({
        ...course,
        indexes: [],
        detailError: detailError.message,
      });
    } finally {
      if (isCurrent()) setDetailLoading(false);
    }
  };

  const currentYear =
    planningRequest?.academic_year ||
    courses[0]?.academic_year ||
    "—";

  const currentSemester =
    planningRequest?.semester || courses[0]?.semester || "—";

  const studentName = student?.student_name || "Loading student";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#main"
          aria-label="Smart STARS home"
        >
          <span className="brand-mark">✦</span>
          <span>
            <strong>Smart</strong>
            <br />
            STARS
          </span>
        </a>

        <p className="sidebar-label">Academic planning</p>

        <nav aria-label="Primary navigation">
          <button
            className={`nav-item ${
              page === "explorer" ? "active" : ""
            }`}
            type="button"
            onClick={() => setPage("explorer")}
          >
            <Icon name="grid" />
            <span>Course explorer</span>
          </button>

          <button
            className={`nav-item ${
              page === "planner" ? "active" : ""
            }`}
            type="button"
            onClick={() => setPage("planner")}
          >
            <Icon name="calendar" />
            <span>My planner</span>
            <b>{selected.length}</b>
          </button>

          <button className={`nav-item ${page === "profile" ? "active" : ""}`} type="button"
            aria-current={page === "profile" ? "page" : undefined} onClick={() => setPage("profile")}>
            <Icon name="user" />
            <span>Student profile</span>
          </button>
        </nav>

        <div className="sidebar-meta">
          <div className="sidebar-foot">
            <div className="semester-dot" />
            <span>
              <strong>Semester {currentSemester}</strong>
              <small>AY {displayYear(currentYear)}</small>
            </span>
          </div>

          <div className="sidebar-student">
            <span className="sidebar-avatar">
              {initials(studentName)}
            </span>
            <span>
              <strong>{studentName}</strong>
              <small>
                {student
                  ? `${student.programme} · Year ${student.study_year}`
                  : "Connecting…"}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span>Academic planning</span>
            <i>/</i>
            <strong>
              {page === "planner" ? "My planner" : page === "profile" ? "Student profile" : "Course explorer"}
            </strong>
          </div>

          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === "dark"}
            aria-label={`Switch to ${
              theme === "dark" ? "day" : "night"
            } mode`}
            onClick={() =>
              setTheme((current) =>
                current === "dark" ? "light" : "dark"
              )
            }
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            <span>{theme === "dark" ? "Day" : "Night"}</span>
          </button>
        </header>

        <main id="main">
          {page === "planner" ? (
            <Planner
              planningRequest={planningRequest}
              selectedCodes={selectedCodes}
              courses={courses}
              preferredPlanId={workingPlanId}
              onPlanChanged={(planId, codes) => {
                refreshSelectionContext();
                workingPlanRef.current = planId;
                setWorkingPlanId(planId);
                setSelectedCodes(codes);
              }}
              onBackToExplorer={() => setPage("explorer")}
              onTargetAuUpdated={(updatedRequest) =>
                setPlanningRequest(updatedRequest)
              }
            />
          ) : page === "profile" ? (
            <StudentProfile studentId={studentId} workingPlanId={workingPlanId}
              selectionRevision={selectionRevision} planningLoading={loading} planningError={error}
              onRetryPlanning={() => setLoadRevision(n => n + 1)} />
          ) : (
            <>
              <section className="hero">
                <div>
                  <p className="eyebrow">
                    Semester {currentSemester} · AY{" "}
                    {displayYear(currentYear)}
                  </p>
                  <h1>Course Explorer</h1>
                  <p className="hero-copy">
                    Explore available courses, check eligibility and
                    prerequisites, and add courses to your semester plan.
                  </p>
                </div>
                <button className="degree-audit" type="button" onClick={() => setPage("profile")}>
                  Degree audit &amp; curriculum <span aria-hidden="true">↗</span>
                </button>
              </section>

              <section
                className={`curriculum-note ${
                  error ? "connection-error" : ""
                }`}
                aria-label="Database status"
              >
                <span className="note-icon">
                  <Icon name="book" />
                </span>
                <div>
                  <strong>
                    {error
                      ? "Database connection unavailable"
                      : "Project database connected"}
                  </strong>
                  <p>
                    {error
                      ? `${error} Start the backend and MySQL, then refresh this page.`
                      : "Courses, indexes, student record and eligibility come from the repository database."}
                  </p>
                </div>
              </section>

              {(actionError || contextError) && (
                <section
                  className="curriculum-note connection-error"
                  role="alert"
                >
                  <span className="note-icon">!</span>
                  <div>
                    <strong>{actionError ? "Could not update selected courses" : "Could not refresh planning context"}</strong>
                    <p>{actionError || contextError}</p>
                  </div>
                </section>
              )}

              <div className="explorer-layout">
                <section
                  className="catalogue"
                  aria-label="Course catalogue"
                >
                  <div className="filter-panel">
                    <label className="search-field">
                      <span>Search courses</span>
                      <span className="input-wrap">
                        <Icon name="search" />
                        <input
                          value={query}
                          onChange={(event) =>
                            setQuery(event.target.value)
                          }
                          placeholder="Course code or title"
                        />
                      </span>
                    </label>

                    <label>
                      <span>Academic units</span>
                      <select
                        value={au}
                        onChange={(event) =>
                          setAu(event.target.value)
                        }
                      >
                        <option>All AU values</option>
                        {auValues.map((value) => (
                          <option key={value} value={value}>
                            {value} AU
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Course type</span>
                      <select
                        value={courseType}
                        onChange={(event) =>
                          setCourseType(event.target.value)
                        }
                      >
                        <option>All course types</option>
                        <option value="CORE">Core courses</option>
                        <option value="MPE">
                          Major Professional Electives (MPE)
                        </option>
                        <option value="BDE">BDE courses</option>
                      </select>
                    </label>
                  </div>

                  <div className="result-line">
                    <p>
                      <strong>{visibleCourses.length}</strong>{" "}
                      {visibleCourses.length === 1
                        ? "course"
                        : "courses"}
                    </p>
                    <button type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </div>

                  {loading ? (
                    <div className="empty-state">
                      <span>…</span>
                      <h2>Loading database courses</h2>
                      <p>Reading the local backend API.</p>
                    </div>
                  ) : error ? (
                    <div className="empty-state error-state">
                      <span>!</span>
                      <h2>Courses could not be loaded</h2>
                      <p>No simulated course data is being shown.</p>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                      >
                        Try again
                      </button>
                    </div>
                  ) : visibleCourses.length ? (
                    <div className="course-grid">
                      {visibleCourses.map((course) => {
                        const status = courseStatus(
                          course,
                          selectedCodes,
                          completedCodes
                        );

                        const blocked = status === "completed";

                        return (
                          <article
                            className={`course-card ${
                              blocked ? "course-card-disabled" : ""
                            }`}
                            key={`${course.course_code}-${course.academic_year}-${course.semester}`}
                          >
                            <div className="card-top">
                              <span>{course.course_code}</span>
                              <span className={`status ${status}`}>
                                {statusLabels[status]}
                              </span>
                            </div>

                            <h2>{course.course_name}</h2>

                            <p className="description">
                              {course.available_semesters?.length
                                ? course.available_semesters.map(term => `AY ${displayYear(term.academic_year)} Semester ${term.semester}`).join("; ")
                                : `AY ${displayYear(course.academic_year)} Semester ${course.semester}`} ·{" "}
                              {formatGradingType(course.grading_type)}
                            </p>

                            <p className="course-meta">
                              <strong>{Number(course.au)} AU</strong>
                              {course.course_types?.length ? (
                                <>
                                  <span>·</span>
                                  {course.course_types
                                    .map(
                                      (type) =>
                                        courseTypeLabels[type] || type
                                    )
                                    .join(" · ")}
                                </>
                              ) : null}
                            </p>

                            <p
                              className={`eligibility ${
                                ["not-yet", "review"].includes(status)
                                  ? "warning"
                                  : ""
                              }`}
                            >
                              {status === "completed" && (
                                <Icon name="check" />
                              )}
                              {eligibilityText({ ...course, status })}
                            </p>

                            {availabilityMessage(course) && <p className="availability warning">{availabilityMessage(course)}</p>}
                            <div className="card-actions">
                              <button
                                className="detail-link"
                                type="button"
                                onClick={() => openDetails(course)}
                              >
                                Course details <span>↗</span>
                              </button>

                              <button
                                className={`course-action ${
                                  status === "planned" ? "selected" : ""
                                }`}
                                type="button"
                                disabled={savingCourse || (status !== "planned" && cannotAdd(course))}
                                onClick={() => toggleCourse(course)}
                              >
                                {status === "planned" ? (
                                  <>
                                    <Icon name="check" /> Planned
                                  </>
                                ) : status === "completed" ? (
                                  "Completed"
                                ) : course.available_for_planning_term === false ? (
                                  "Not offered this term"
                                ) : blocked ? (
                                  "Not eligible"
                                ) : (
                                  <>
                                    <Icon name="plus" /> Add course
                                  </>
                                )}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <span>⌕</span>
                      <h2>No matching courses</h2>
                      <p>
                        Try a broader keyword or clear one of the filters.
                      </p>
                      <button type="button" onClick={clearFilters}>
                        Clear all filters
                      </button>
                    </div>
                  )}
                </section>

                <aside className="selection-rail">
                  <div className="rail-head">
                    <p className="eyebrow">Your semester, so far</p>

                    <div className="rail-title">
                      <h2>Selected courses</h2>
                      <span>{selected.length}</span>
                    </div>

                    <div className="au-line">
                      <strong>{selectedAu}</strong>
                      <span>/ {targetAu} AU target</span>
                    </div>

                    <div className="meter">
                      <span
                        style={{
                          width: `${Math.min(
                            (selectedAu / targetAu) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rail-body">
                    {selected.length ? (
                      selected.map((course) => (
                        <div
                          className="selected-course"
                          key={course.course_code}
                        >
                          <div>
                            <strong>{course.course_code}</strong>
                            <p>{course.course_name}</p>
                            <small>
                              {Number(course.au)} AU · Semester{" "}
                              {course.semester}
                            </small>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleCourse(course)}
                            aria-label={`Remove ${course.course_code}`}
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="rail-empty">
                        No courses are selected in this planning request.
                      </p>
                    )}

                    <button
                      className="primary-button"
                      type="button"
                      disabled={!selected.length}
                      onClick={() => setPage("planner")}
                    >
                      Continue to planner <Icon name="arrow" />
                    </button>

                    <p className="rail-tip">
                      Selections are saved in your planning request.
                      Choose class indexes in My Planner.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
        </main>

        <footer>
          <span>Smart STARS companion</span>
          <p>
            Course and student information loaded from the project
            database.
          </p>
        </footer>
      </div>

      {activeCourse && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget &&
            setActiveCourse(null)
          }
        >
          <section
            className="course-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="dialog-close"
              type="button"
              onClick={() => setActiveCourse(null)}
              aria-label="Close course details"
            >
              <Icon name="close" />
            </button>

            <p className="dialog-code">
              {activeCourse.course_code} · {Number(activeCourse.au)} AU
            </p>

            <h2 id="dialog-title">
              {activeCourse.course_name}
            </h2>

            <p className="dialog-description">
              AY {displayYear(activeCourse.academic_year)} · Semester{" "}
              {activeCourse.semester} · {formatGradingType(activeCourse.grading_type)}
            </p>

            <dl className="requirements">
              <div>
                <dt>Prerequisites</dt>
                <dd>
                  {activeCourse.prerequisite_text || "None recorded"}
                </dd>
              </div>
              <div>
                <dt>Restrictions</dt>
                <dd>
                  {activeCourse.restriction_text || "None recorded"}
                </dd>
              </div>
              <div>
                <dt>Mutual exclusions</dt>
                <dd>
                  {activeCourse.mutually_exclusive_text ||
                    "None recorded"}
                </dd>
              </div>
              <div>
                <dt>Exam</dt>
                <dd>
                  {activeCourse.exam_datetime
                    ? new Date(
                        activeCourse.exam_datetime
                      ).toLocaleString()
                    : "No exam date recorded"}
                </dd>
              </div>
            </dl>

            <p
              className={`dialog-eligibility ${
                activeCourse.eligibility?.eligible
                  ? ""
                  : "warning"
              }`}
            >
              <Icon
                name={
                  activeCourse.eligibility?.eligible
                    ? "check"
                    : "book"
                }
              />
              {eligibilityText({
                ...activeCourse,
                status: courseStatus(
                  activeCourse,
                  selectedCodes,
                  completedCodes
                ),
              })}
            </p>

            <h3>Available indexes</h3>
            {availabilityMessage(activeCourse) && <p className="availability warning">{availabilityMessage(activeCourse)}</p>}

            {detailLoading ? (
              <div className="index-empty">
                Loading indexes and timetable…
              </div>
            ) : activeCourse.detailError ? (
              <div className="index-empty">
                {activeCourse.detailError}
              </div>
            ) : activeCourse.indexes?.length ? (
              <div className="index-list">
                {activeCourse.indexes.map((index) => (
                  <div
                    className="index-item"
                    key={index.index_no}
                  >
                    <strong>
                      Index {index.index_no} · {index.vacancy == null ? "Vacancy not published" : `${index.vacancy} vacancies`}
                      {index.academic_year && ` · AY ${displayYear(index.academic_year)} Semester ${index.semester}`}
                    </strong>

                    {index.slots.length ? (
                      index.slots.map((slot) => (
                        <span key={slot.slot_id}>
                          {formatSlot(slot)}
                        </span>
                      ))
                    ) : (
                      <span>Timetable data unavailable</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="index-empty">
                No indexes are recorded for this course.
              </div>
            )}

            <button
              className={`dialog-action ${
                selectedCodes.includes(activeCourse.course_code)
                  ? "remove"
                  : ""
              }`}
              type="button"
              disabled={savingCourse || (!selectedCodes.includes(activeCourse.course_code) && cannotAdd(activeCourse))}
              onClick={() => toggleCourse(activeCourse)}
            >
              {selectedCodes.includes(activeCourse.course_code)
                ? "Remove from semester"
                : completedCodes.has(activeCourse.course_code)
                ? "Credit already recorded"
                : activeCourse.available_for_planning_term === false
                ? "Not offered this term"
                : activeCourse.eligibility?.can_select === false
                ? "Not eligible"
                : "Add to semester"}
            </button>
          </section>
        </div>
      )}

      <ReasonDialog
        problem={reasonProblem}
        onClose={() => setReasonProblem(null)}
      />

      {/* Smart STARS AI Assistant */}
      <ChatWidget />
    </div>
  );
}

const exportPlanId = new URLSearchParams(
  window.location.search
).get("exportPlan");

// Resolve identity before mounting any student-scoped component, including Leo.
// A keyed subtree prevents plan/profile/history state surviving an identity change.
function IdentityBootstrap() {
  const [identity, setIdentity] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setIdentity(null);
    setError("");
    api.currentStudent().then(current => {
      if (typeof current?.student_id !== "string" || !current.student_id.trim()) {
        throw new Error("The server did not provide a current student identity.");
      }
      if (!cancelled) setIdentity(current.student_id);
    }).catch(failure => {
      if (!cancelled) setError(failure.message || "Could not resolve the current student.");
    });
    return () => { cancelled = true; };
  }, [revision]);
  if (error) return <main className="workspace" role="alert">
    <p>{error}</p><button type="button" onClick={() => setRevision(n => n + 1)}>Retry identity</button>
  </main>;
  if (!identity) return <main className="workspace" role="status">Loading current student…</main>;
  return exportPlanId ? <ExportPlan key={identity} planId={exportPlanId} /> : <App key={identity} studentId={identity} />;
}

export const appRoot = createRoot(document.getElementById("root"));
appRoot.render(
  <React.StrictMode>
    <IdentityBootstrap />
  </React.StrictMode>
);
