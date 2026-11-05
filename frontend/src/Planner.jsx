import React, { useEffect, useMemo, useRef, useState } from "react";
import { indexesForPlanningTerm } from "./planningContext";
import { api } from "./api";
import PlannerPreferences from "./PlannerPreferences";
import ReasonDialog from "./ReasonDialog";
import { courseProblem, indexProblem, generationProblem } from "./reasonUtils";
import "./planner.css";

// Full teaching week
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const FIRST_HOUR = 8;
const LAST_HOUR = 22;
const PIXELS_PER_HOUR = 44;

const COURSE_COLORS = [
  "#d71945",
  "#225894",
  "#6b53ae",
  "#238878",
  "#a76b23",
  "#9d4381",
];

const PREFS_KEY = "smart-stars-planner-calendar-features-v1";

const shortTime = (value) =>
  String(value || "").slice(0, 5);

const CLASS_TYPE_LABELS = {
  LECTURE: "LEC",
  TUTORIAL: "TUT",
};

const shortClassType = (value) =>
  CLASS_TYPE_LABELS[String(value || "").toUpperCase()] || "";

const formatSession = (slot) =>
  `${slot.day_of_week} ${shortTime(slot.start_time)}–${shortTime(
    slot.end_time
  )}${slot.venue ? ` · ${slot.venue}` : ""}`;

const minuteOfDay = (time) => {
  const [hour, minute] = String(time || "")
    .split(":")
    .map(Number);

  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : null;
};

const blockKey = (day, hour) =>
  `${day}-${String(hour).padStart(2, "0")}`;

const overlapsHour = (slot, day, hour) => {
  if (slot.day_of_week !== day) return false;

  const start = minuteOfDay(slot.start_time);
  const end = minuteOfDay(slot.end_time);

  return (
    start !== null &&
    end !== null &&
    start < (hour + 1) * 60 &&
    end > hour * 60
  );
};

const readCalendarPrefs = () => {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PREFS_KEY) || "{}"
    );

    return stored && typeof stored === "object"
      ? stored
      : {};
  } catch {
    return {};
  }
};

// Clear stored course locks after removal.
export function forgetStoredCourseLocks(requestId, code) {
  try {
    const current = readCalendarPrefs();

    const updated = Object.fromEntries(
      Object.entries(current).map(([key, prefs]) => {
        if (!key.startsWith(`${requestId}:`)) {
          return [key, prefs];
        }

        const locked = { ...(prefs.locked || {}) };
        delete locked[code];

        return [key, { ...prefs, locked }];
      })
    );

    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify(updated)
    );
  } catch {
    // Local storage is optional.
  }
}

// Icons
function BlockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </svg>
  );
}

function LockIcon({ small = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={small ? "2.5" : "2.1"}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

// Weekly calendar
export function WeeklyCalendar({
  slots,
  mode,
  blockedHours,
  lockedIndexes,
  onHourClick,
  onLessonClick,
  busy,
  pixelsPerHour = PIXELS_PER_HOUR,
  courseColors = COURSE_COLORS,
  displayFields = {
    courseTitle: false,
    classType: true,
    time: true,
    venue: true,
  },
}) {
  const hours = Array.from(
    { length: LAST_HOUR - FIRST_HOUR + 1 },
    (_, hour) => hour + FIRST_HOUR
  );

  const colors = [
    ...new Set(slots.map((slot) => slot.course_code)),
  ];

  return (
    <div
      className={`planner-calendar-full ${
        mode ? `is-${mode}-mode` : ""
      }`}
    >
      <div
        className="planner-week"
        style={{
          "--planner-days": DAYS.length,
          "--planner-day-height": `${
            (LAST_HOUR - FIRST_HOUR) * pixelsPerHour
          }px`,
          "--planner-hour-height": `${pixelsPerHour}px`,
        }}
      >
        <div className="planner-time-head">Time</div>

        {DAYS.map((day, index) => (
          <div className="planner-day-head" key={day}>
            {DAY_NAMES[index]}
          </div>
        ))}

        <div className="planner-time-axis">
          {hours.map((hour) => (
            <span
              key={hour}
              style={{
                top: `${
                  (hour - FIRST_HOUR) * pixelsPerHour
                }px`,
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {DAYS.map((day) => (
          <div className="planner-day-column" key={day}>
            {hours.slice(0, -1).map((hour) => {
              const blocked = blockedHours.includes(
                blockKey(day, hour)
              );

              const time = String(hour).padStart(2, "0");

              return (
                <button
                  key={hour}
                  type="button"
                  className={`planner-hour-block ${
                    blocked ? "is-blocked" : ""
                  }`}
                  disabled={mode !== "block" || busy}
                  aria-label={`${
                    blocked ? "Unblock" : "Block"
                  } ${
                    DAY_NAMES[DAYS.indexOf(day)]
                  } ${time}:00–${String(hour + 1).padStart(
                    2,
                    "0"
                  )}:00`}
                  aria-pressed={blocked}
                  title={`${
                    blocked ? "Unblock" : "Block"
                  } ${day} ${time}:00–${String(
                    hour + 1
                  ).padStart(2, "0")}:00`}
                  onClick={() => onHourClick(day, hour)}
                >
                  {blocked && (
                    <span aria-hidden="true">Blocked</span>
                  )}
                </button>
              );
            })}

            {slots
              .filter((slot) => slot.day_of_week === day)
              .map((slot) => {
                const start = minuteOfDay(slot.start_time);
                const end = minuteOfDay(slot.end_time);

                if (
                  start === null ||
                  end === null ||
                  end <= start
                ) {
                  return null;
                }

                const clippedStart = Math.max(
                  FIRST_HOUR * 60,
                  start
                );

                const clippedEnd = Math.min(
                  LAST_HOUR * 60,
                  end
                );

                if (clippedEnd <= clippedStart) {
                  return null;
                }

                const color =
                  courseColors[
                    colors.indexOf(slot.course_code) %
                      courseColors.length
                  ];

                const locked =
                  Number(lockedIndexes[slot.course_code]) ===
                  Number(slot.index_no);

                return (
                  <button
                    type="button"
                    key={`${slot.course_code}-${slot.index_no}-${slot.slot_id}`}
                    className={`planner-lesson ${
                      locked ? "is-locked" : ""
                    }`}
                    disabled={mode !== "lock" || busy}
                    aria-pressed={locked}
                    aria-label={`${slot.course_code}, index ${
                      slot.index_no
                    }, ${formatSession(slot)}. ${
                      locked
                        ? "Locked. Click to unlock"
                        : "Click to lock index"
                    }`}
                    style={{
                      top: `${
                        ((clippedStart -
                          FIRST_HOUR * 60) /
                          60) *
                        pixelsPerHour
                      }px`,
                      height: `${Math.max(
                        21,
                        ((clippedEnd - clippedStart) /
                          60) *
                          pixelsPerHour -
                          2
                      )}px`,
                      "--lesson-color": color,
                    }}
                    title={`${slot.course_code} · Index ${
                      slot.index_no
                    }\n${slot.class_type}\n${formatSession(
                      slot
                    )}${locked ? "\nLocked" : ""}`}
                    onClick={() =>
                      onLessonClick(
                        slot.course_code,
                        slot.index_no
                      )
                    }
                  >
                    <span className="planner-lesson-heading">
                      <span className="planner-lesson-identity">
                        <strong>{slot.course_code}</strong>

                        {displayFields.classType && shortClassType(slot.class_type) && (
                          <span className="planner-lesson-type">
                            {shortClassType(slot.class_type)}
                          </span>
                        )}
                      </span>

                      {locked && (
                        <span
                          className="planner-lesson-lock"
                          title="Index locked"
                        >
                          <LockIcon small />
                        </span>
                      )}
                    </span>

                    {displayFields.courseTitle && slot.course_title && (
                      <span className="planner-lesson-title">
                        {slot.course_title}
                      </span>
                    )}

                    {displayFields.time && (
                      <span>
                        {shortTime(slot.start_time)}–
                        {shortTime(slot.end_time)}
                      </span>
                    )}

                    {displayFields.venue && (
                      <small>
                        {slot.venue || "Venue TBA"}
                      </small>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Available indexes
function IndexOptions({
  course,
  semester,
  options,
  selectedIndex,
  onChoose,
  busy,
}) {
  return (
    <div className="planner-index-options">
      <p className="planner-help">
        Choose an index for {course.course_code}. The
        backend checks clashes before saving.
      </p>

      {options.length ? (
        options.map((index) => {
          const isSelected =
            Number(selectedIndex) ===
            Number(index.index_no);

          return (
            <div
              className="planner-index-row"
              key={index.index_no}
            >
              <div className="planner-index-text">
                <strong>
                  Index {index.index_no}
                </strong>

                <small>
                  {index.vacancy === null
                    ? "Vacancy unknown"
                    : `${index.vacancy} vacant`}{" "}
                  ·{" "}
                  {index.slots === null
                    ? "Timetable could not be loaded"
                    : index.slots.length
                    ? `${index.slots.length} session${
                        index.slots.length === 1 ? "" : "s"
                      }`
                    : "No timetable slots"}
                </small>

                {index.slots?.map((slot) => (
                  <small key={slot.slot_id}>
                    {formatSession(slot)}
                  </small>
                ))}
              </div>

              <button
                className={`planner-small-action ${
                  isSelected ? "is-saved" : ""
                }`}
                type="button"
                disabled={
                  busy ||
                  isSelected ||
                  !index.slots?.length
                }
                onClick={() =>
                  onChoose(
                    course.course_code,
                    index.index_no
                  )
                }
              >
                {isSelected ? "Selected" : "Choose"}
              </button>
            </div>
          );
        })
      ) : (
        <p className="planner-empty-inline">
          No indexes available for Semester {semester}
        </p>
      )}
    </div>
  );
}

export default function Planner({
  planningRequest,
  selectedCodes,
  courses,
  preferredPlanId,
  onPlanChanged,
  onBackToExplorer,
  onTargetAuUpdated,
}) {
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [indexes, setIndexes] = useState([]);
  const [slots, setSlots] = useState([]);
  const [timetableMeta, setTimetableMeta] = useState(null);
  const [optionsByCourse, setOptionsByCourse] = useState({});
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [courseInput, setCourseInput] = useState("");
  const [featureMode, setFeatureMode] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [generationFailure, setGenerationFailure] = useState(null);
  const generationIssue = generationFailure ? generationProblem(generationFailure) : null;
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(null);
  const [targetAuDraft, setTargetAuDraft] = useState(
    String(planningRequest?.target_au ?? 18)
  );

  useEffect(() => {
    setTargetAuDraft(
      String(planningRequest?.target_au ?? 18)
    );
  }, [
    planningRequest?.request_id,
    planningRequest?.target_au,
  ]);

  const requestId = planningRequest?.request_id;
  const indexContext = `${activePlanId}/${requestId}/${planningRequest?.academic_year}/${planningRequest?.semester}`;
  const indexContextRef = useRef(indexContext);
  indexContextRef.current = indexContext;
  useEffect(() => {
    indexContextRef.current = indexContext;
    setOptionsByCourse({});
    setExpandedCourse(null);
    return () => { indexContextRef.current = null; };
  }, [indexContext]);

  const selected = useMemo(
    () =>
      selectedCodes.map(
        (code) =>
          courses.find(
            (course) =>
              course.course_code === code &&
              course.academic_year ===
                planningRequest?.academic_year &&
              Number(course.semester) ===
                Number(planningRequest?.semester)
          ) ||
          courses.find(
            (course) => course.course_code === code
          ) || {
            course_code: code,
            course_name: "Course details unavailable",
            au: null,
          }
      ),
    [selectedCodes, courses, planningRequest]
  );

  const selectedAu = selected.reduce(
    (sum, course) => sum + (Number(course.au) || 0),
    0
  );

  const activePlan = plans.find(
    (plan) =>
      Number(plan.plan_id) === Number(activePlanId)
  );
  // Find the plan that has already been confirmed.
  const confirmedPlan = plans.find(
    (plan) => Boolean(plan.active_selection)
  );
  // Keep all backend plans, but group them for the interface.
  const planEntries = plans.map((plan, position) => ({
    plan,
    position,
  }));

  const autoPlanPattern = /^AUTO Plan [ABC] #(\d+)$/;

  // Identify all generated plans.
  const allGeneratedPlanEntries = planEntries.filter(
    ({ plan }) => autoPlanPattern.test(plan.plan_name)
  );

  // Identify the latest generation batch.
  const latestGeneration = Math.max(
    0,
    ...allGeneratedPlanEntries.map(({ plan }) =>
      Number(plan.plan_name.match(autoPlanPattern)[1])
    )
  );

  // Only the latest generation appears in the main Plan A/B/C buttons.
  const generatedPlanEntries = allGeneratedPlanEntries.filter(
    ({ plan }) =>
      Number(plan.plan_name.match(autoPlanPattern)[1]) ===
      latestGeneration
  );

  // Preserve older generated plans separately.
  const previousGeneratedEntries = allGeneratedPlanEntries.filter(
    ({ plan }) =>
      Number(plan.plan_name.match(autoPlanPattern)[1]) !==
      latestGeneration
  );

  // Manual plans remain separate.
  const manualPlanEntries = planEntries.filter(
    ({ plan }) => !autoPlanPattern.test(plan.plan_name)
  );

  const blockedHours = DAYS.flatMap(day => Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => i + FIRST_HOUR)
    .filter(hour => blocks.some(block => overlapsHour(block, day, hour))).map(hour => blockKey(day, hour)));
  const lockedIndexes = Object.fromEntries(indexes.filter(i => i.locked).map(i => [i.course_code, i.index_no]));
  const reloadRequest = async () => {
    const [nextBlocks, nextPlans] = await Promise.all([
      activePlanId
        ? api.planBlocks(activePlanId)
        : Promise.resolve([]),
      api.plans(requestId),
    ]);

    const visiblePlans = nextPlans.filter(
      (plan) => plan.status !== "ARCHIVED"
    );

    const activeSummary = activePlanId
      ? await api.planSummary(activePlanId)
      : null;

    setBlocks(nextBlocks);
    setPlans(visiblePlans);
    setSummary(activeSummary);
  };
  const toggleHourBlock = async (day, hour) => {
    if (featureMode !== "block" || busy) return;
    const start = `${String(hour).padStart(2, "0")}:00:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00:00`;
    const overlapping = blocks.filter(
      (block) => overlapsHour(block, day, hour)
    );
    setBusy(true); setError(""); setGenerationFailure(null);
    try {
      if (!activePlanId) {
        throw new Error("Select a plan before editing blocked periods.");
      }

      if (overlapping.length) {
        await Promise.all(
          overlapping.map((block) =>
            api.removePlanBlock(activePlanId, block.block_id)
          )
        );
      } else {
        await api.addPlanBlock(activePlanId, {
          day_of_week: day,
          start_time: start,
          end_time: end,
        });
      }
      await reloadRequest();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const toggleLessonLock = async (code) => {
    if (featureMode !== "lock" || busy) return;
    setBusy(true); setError("");
    try { await api.lockIndex(activePlanId, code, !lockedIndexes[code]); await refreshTimetable(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError(""); setGenerationFailure(null); setNotice("");
    try {
      if (!activePlanId) {
        throw new Error("Select a plan before generating its timetable.");
      }

      const result = await api.regeneratePlan(activePlanId);
      await refreshTimetable();
      setNotice(
        `${result.plan_name} was regenerated. Its blocked periods and locked indexes were preserved.`
      );
    } catch (e) { setError(e.message); setGenerationFailure(e.details); }
    finally { setBusy(false); }
  };

  // Load the student's existing plans.
  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;

    const loadPlans = async () => {
      setLoading(true);
      setError("");

      try {
        const existing = await api.plans(requestId);
        let next = existing.filter(p => p.status !== "ARCHIVED");

        // A new planner workspace always begins with three independent plans.
        // Creating a plan copies the request's selected courses, but no indexes,
        // so all three timetables start blank and can later keep separate
        // blocks, locks and regenerated index arrangements.
        let attempts = 0;
        while (next.length < 3 && attempts < 6) {
          attempts++;
          const latest = await api.plans(requestId);
          next = latest.filter(p => p.status !== "ARCHIVED");
          if (next.length >= 3) break;

          let number = 1;
          while (latest.some(p => p.plan_name === `Plan ${number}`)) number++;

          try {
            await api.createPlan(requestId, `Plan ${number}`);
          } catch (createError) {
            // React development mode or a second open tab can initialize the
            // same request concurrently. Reload after the harmless name race.
            if (createError.status !== 409) throw createError;
          }
        }

        next = (await api.plans(requestId)).filter(p => p.status !== "ARCHIVED");
        if (next.length < 3) {
          throw new Error("The three initial plans could not be created.");
        }

        if (!cancelled) {
          setPlans(next);
          const active = await api.activePlan(requestId);

          // Prefer the latest generated Plan A when no plan is finalized.
          // Preserve the student's finalized plan if one exists.
          const defaultGeneratedPlan = next
            .filter(
              (plan) => /^AUTO Plan A #\d+$/.test(plan.plan_name)
            )
            .sort(
              (a, b) =>
                Number(b.plan_name.match(/#(\d+)$/)[1]) -
                Number(a.plan_name.match(/#(\d+)$/)[1])
            )[0];

          if (!cancelled) {
            const preferred = next.find(
              (plan) =>
                Number(plan.plan_id) === Number(preferredPlanId)
            );

            setActivePlanId(
              preferred?.plan_id ??
              active.plan?.plan_id ??
              defaultGeneratedPlan?.plan_id ??
              next[0]?.plan_id
            );
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  // Load selected plan's indexes and timetable.
  useEffect(() => {
    if (!activePlanId) {
      setIndexes([]);
      setSlots([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [
          savedIndexes,
          timetable,
          detail,
          planCourses,
          planBlocks,
        ] = await Promise.all([
          api.planIndexes(activePlanId),
          api.planTimetable(activePlanId),
          api.planSummary(activePlanId),
          api.planSelectedCourses(activePlanId),
          api.planBlocks(activePlanId),
        ]);

        if (!cancelled) {
          setIndexes(savedIndexes);
          setSlots(timetable.data);
          setTimetableMeta(timetable);
          setSummary(detail);
          setBlocks(planBlocks);

          onPlanChanged?.(
            activePlanId,
            planCourses.map((row) => row.course_code)
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activePlanId]);

  const refreshTimetable = async () => {
    const [savedIndexes, timetable, detail] =
      await Promise.all([
        api.planIndexes(activePlanId),
        api.planTimetable(activePlanId),
        api.planSummary(activePlanId),
      ]);

    setIndexes(savedIndexes);
    setSlots(timetable.data);
    setTimetableMeta(timetable);
    setSummary(detail);
    await reloadRequest();
  };

  // Switch only when the target is different. Clearing an already-active plan
  // would leave the calendar empty because the loading effect depends on its ID.
  const switchPlan = (position) => {
    if (!requestId || busy || loading || !plans[position]) return;

    const nextPlanId = Number(plans[position].plan_id);
    if (nextPlanId === Number(activePlanId)) return;

    setError("");
    setNotice("");
    setExpandedCourse(null);
    setFeatureMode(null);
    setProblem(null);
    setSummary(null);
    setSlots([]);
    setIndexes([]);
    setTimetableMeta(null);
    setBlocks([]);

    onPlanChanged?.(nextPlanId, []);
    setActivePlanId(nextPlanId);
  };

  const expandIndexes = async (code) => {
    if (expandedCourse === code) {
      setExpandedCourse(null);
      return;
    }

    setExpandedCourse(code);

    if (optionsByCourse[code]?.context === indexContext) return;
    const context = indexContext;

    setOptionsByCourse((current) => ({
      ...current,
      [code]: { loading: true, context },
    }));

    try {
      const detail = await api.course(code, activePlanId, requestId);

      const options = await Promise.all(
        indexesForPlanningTerm(detail.indexes, planningRequest).map(async (index) => {
          try {
            return {
              ...index,
              slots: await api.timetable(
                code,
                index.index_no
              ),
            };
          } catch {
            return {
              ...index,
              slots: null,
            };
          }
        })
      );

      if (indexContextRef.current !== context) return;
      setOptionsByCourse((current) => ({
        ...current,
        [code]: {
          loading: false,
          context,
          options,
        },
      }));
    } catch (loadError) {
      if (indexContextRef.current !== context) return;
      setOptionsByCourse((current) => ({
        ...current,
        [code]: {
          loading: false,
          context,
          error: loadError.message,
        },
      }));
    }
  };

  // Select an index and show a reason popup on failure.
  const chooseIndex = async (code, indexNo) => {
    if (!activePlanId) return;

    if (
      lockedIndexes[code] != null &&
      Number(lockedIndexes[code]) !==
        Number(indexNo)
    ) {
      setProblem(
        indexProblem(
          code,
          indexNo,
          null,
          null,
          `${code} is locked to index ${lockedIndexes[code]}. Select the Lock tool and click its class to unlock it first.`
        )
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const candidateSlots = await api.timetable(
        code,
        indexNo
      );

      const outsideCalendar = candidateSlots.filter(
        (slot) =>
          !DAYS.includes(slot.day_of_week)
      );

      if (outsideCalendar.length) {
        setProblem(
          indexProblem(
            code,
            indexNo,
            null,
            null,
            `Index ${indexNo} has a lesson outside the Monday–Sunday calendar. Please choose another index.`
          )
        );
        return;
      }

      const preview = await api.previewIndex(
        activePlanId,
        code,
        indexNo
      );

      if (!preview.can_save) {
        setProblem(
          indexProblem(
            code,
            indexNo,
            null,
            preview
          )
        );
        return;
      }

      await api.putIndex(
        activePlanId,
        code,
        indexNo
      );

      await refreshTimetable();

      setNotice(
        `${code} index ${indexNo} was saved to ${
          activePlan?.plan_name || "this plan"
        }.`
      );

      setExpandedCourse(null);

      await reloadRequest();
    } catch (changeError) {
      setProblem(
        indexProblem(
          code,
          indexNo,
          changeError
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const clearIndex = async (code) => {
    if (!activePlanId) return;

    if (lockedIndexes[code] != null) {
      setError(
        `${code} is locked. Select the Lock tool and click its class in the calendar to unlock it first.`
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api.removeIndex(
        activePlanId,
        code
      );

      await refreshTimetable();

      setNotice(
        `${code} index removed from this plan (course still selected).`
      );

    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
    }
  };

  // Add a course and explain failures.
  const addCourse = async (event) => {
    event.preventDefault();

    const code = courseInput.trim().toUpperCase();

    if (!code) return;

    if (!/^[A-Z0-9]{1,10}$/.test(code)) {
      setProblem(
        courseProblem(
          code || "Course code",
          new Error(
            "Enter a valid course code using letters and numbers only."
          )
        )
      );
      return;
    }

    if (selectedCodes.includes(code)) {
      setNotice(`${code} is already selected.`);
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!activePlanId) {
        throw new Error("Select a plan before adding courses.");
      }

      await api.addPlanSelectedCourse(activePlanId, code);

      const updated = await api.planSelectedCourses(activePlanId);

      onPlanChanged?.(
        activePlanId,
        updated.map((row) => row.course_code)
      );

      await refreshTimetable();

      setCourseInput("");
      setNotice(
        `${code} added to ${activePlan?.plan_name || "this plan"}.`
      );
    } catch (changeError) {
      setProblem(
        courseProblem(code, changeError)
      );
    } finally {
      setBusy(false);
    }
  };

  // Remove the course and all its indexes in one action.
  const removeCourse = async (code) => {
    if (busy || !activePlanId) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api.removePlanSelectedCourse(activePlanId, code);

      const updated = await api.planSelectedCourses(activePlanId);

      onPlanChanged?.(
        activePlanId,
        updated.map((row) => row.course_code)
      );

      setExpandedCourse((current) =>
        current === code ? null : current
      );

      setOptionsByCourse((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });

      await refreshTimetable();

      setNotice(
        `${code} and its chosen index were removed from ${
          activePlan?.plan_name || "this plan"
        }. Other plans were not changed.`
      );
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
    }
  };

  // Validate and confirm the selected plan.
  const savePlan = async () => {
    if (!activePlanId) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const check = await api.validatePlan(
        activePlanId
      );

      if (!check.can_finalize) {
        const missing =
          check.eligibility?.missing_index_courses ||
          [];

        const conflicts =
          check.timetable?.conflicts || [];

        setError(
          `Plan is not ready to confirm.${
            missing.length
              ? ` Select indexes for ${missing.join(
                  ", "
                )}.`
              : ""
          }${
            conflicts.length
              ? ` Resolve ${conflicts.length} timetable clash(es).`
              : ""
          } Check academic eligibility and timetable data if all courses have indexes.`
        );

        return;
      }

      await api.selectPlan(activePlanId);

      await reloadRequest();
      setNotice(
        `${
          activePlan?.plan_name || "Plan"
        } is confirmed in Smart STARS Companion. This does not register you for NTU courses.`
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const exportPlan = () => {
    if (!activePlanId || !slots.length) return;

    const exportUrl = new URL(window.location.href);
    exportUrl.search = "";
    exportUrl.hash = "";
    exportUrl.searchParams.set("exportPlan", activePlanId);

    window.open(
      exportUrl.toString(),
      "_blank",
      "noopener,noreferrer"
    );
  };
  const saveTargetAu = async () => {
    if (!requestId || busy) return;

    const newTarget = Number(targetAuDraft);

    if (
      !Number.isInteger(newTarget) ||
      newTarget < 3 ||
      newTarget > 30
    ) {
      setError("Target AU must be between 3 and 30.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const updatedRequest = await api.updateTargetAu(
        requestId,
        newTarget
      );

      // Synchronize the planning request in main.jsx.
      onTargetAuUpdated?.(updatedRequest);

      setNotice(`Target AU updated to ${newTarget} AU.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="planner-page">
      <section className="planner-heading">
        <div>
          <p className="eyebrow">
            Semester {planningRequest?.semester || "—"} · AY{" "}
            {planningRequest?.academic_year
              ? String(
                  planningRequest.academic_year
                ).replace("-", "–")
              : "—"}
          </p>

          <h1>My Planner</h1>

          <p className="hero-copy">
            Organise your selected courses across three
            independent timetables.
          </p>
        </div>

        <div className="planner-au-summary">
          <strong>{selectedAu} AU</strong>
          <span>
            {planningRequest?.target_au
              ? ` / ${planningRequest.target_au} AU target`
              : " selected"}
          </span>
        </div>
      </section>

      {!requestId && (
        <div
          className="planner-alert planner-alert-error"
          role="status"
        >
          No planning request has been loaded yet.
          You can preview the layout, but add an eligible
          course in Course Explorer with the backend
          running to populate your planner.
        </div>
      )}

      {error && !generationIssue && (
        <div
          className="planner-alert planner-alert-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {generationIssue && (
        <div
          className="planner-alert planner-alert-error planner-generation-alert"
          role="alert"
        >
          <strong>{generationIssue.summary}</strong>
          {generationIssue.timetable_preserved && (
            <p>
              No changes were saved. The previous timetable is still shown so
              you can review it and adjust the conflicting blocks.
            </p>
          )}
          {generationIssue.reasons.length > 0 && (
            <ul>
              {generationIssue.reasons.map((reason, index) => (
                <li key={index}>
                  {reason.course_code && <strong>{reason.course_code}: </strong>}
                  {reason.explanation}
                  {reason.indexes.length > 0 &&
                    ` Affected indexes: ${reason.indexes.join(", ")}.`}
                </li>
              ))}
            </ul>
          )}
          {generationIssue.suggestions.length > 0 && (
            <ul>
              {generationIssue.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <div
          className="planner-alert planner-alert-success"
          role="status"
        >
          {notice}
        </div>
      )}

      <div className="planner-top-grid">
        <section
          className="planner-calendar-panel"
          aria-label="Weekly timetable"
        >
          <div className="planner-section-heading">
            <div>
              <h2>Calendar</h2>
              <p>
                {activePlan?.plan_name || "Plan"} ·{" "}
                {slots.length
                  ? `${slots.length} class session${
                      slots.length === 1 ? "" : "s"
                    }`
                  : "No scheduled classes yet"}
              </p>
            </div>

            {loading && (
              <span className="planner-muted">
                Loading…
              </span>
            )}
          </div>

          <WeeklyCalendar
            slots={slots}
            mode={featureMode}
            blockedHours={blockedHours}
            lockedIndexes={lockedIndexes}
            onHourClick={toggleHourBlock}
            onLessonClick={toggleLessonLock}
            busy={busy || loading}
          />

          <p
            className="planner-calendar-hint"
            role="status"
          >
            {featureMode === "block"
              ? "Block mode: click any empty hourly square to mark or unmark it bright red."
              : featureMode === "lock"
              ? "Lock mode: click a scheduled class to lock or unlock its chosen index."
              : "Select Block or Lock in Features to edit your timetable preferences."}
          </p>

          {timetableMeta?.missing_slot_indexes
            ?.length > 0 && (
            <p className="planner-calendar-note">
              Some saved indexes have missing timetable
              data:{" "}
              {timetableMeta.missing_slot_indexes
                .map(
                  (item) =>
                    `${item.course_code} ${item.index_no}`
                )
                .join(", ")}
              .
            </p>
          )}
        </section>

        <aside
          className="planner-controls"
          aria-label="Planner controls"
        >
          <div className="planner-control-section">
            <h2>Plan</h2>

            <>
              <small className="planner-muted">
                {generatedPlanEntries.length > 0
                  ? "Generated timetables"
                  : "Working plan"}
              </small>

             <div className="planner-plan-buttons">
              {(generatedPlanEntries.length > 0
                ? generatedPlanEntries
                : manualPlanEntries
              ).map(({ plan, position }) => {
                const isViewed =
                  Number(plan.plan_id) === Number(activePlanId);

                const isConfirmed = Boolean(plan.active_selection);

                return (
                  <button
                    key={plan.plan_id}
                    type="button"
                    className={isViewed ? "active" : ""}
                    style={
                      isConfirmed
                        ? {
                            backgroundColor: "#15803d",
                            color: "#ffffff",
                            boxShadow: isViewed
                              ? "0 0 0 3px rgba(21, 128, 61, 0.24)"
                              : "none",
                          }
                        : undefined
                    }
                    aria-pressed={isViewed}
                    disabled={!requestId || busy || loading}
                    title={`${plan.plan_name}${
                      isConfirmed ? " — confirmed final choice" : ""
                    }`}
                    onClick={() => switchPlan(position)}
                 >
                    {plan.plan_name.replace(
                      /^AUTO (Plan [ABC]) #\d+$/,
                      "$1"
                    )}
                    {isConfirmed ? " ✓" : ""}
                  </button>
                  );
              })}
          </div>
          </>

            <small className="planner-muted">
              {activePlan?.active_selection
                ? "Final choice: this plan is confirmed"
                : confirmedPlan
                ? `Final choice: ${confirmedPlan.plan_name.replace(
                    /^AUTO (Plan [ABC]) #\d+$/,
                    "$1"
                )}`
                : "No final choice yet · Each plan has its own indexes"}
            </small>
          </div>

          <div className="planner-control-section">
            <h2>Courses</h2>

            <form
              className="planner-add-form"
              onSubmit={addCourse}
            >
              <input
                aria-label="Course code"
                value={courseInput}
                onChange={(event) =>
                  setCourseInput(
                    event.target.value
                  )
                }
                placeholder="Enter course code"
                disabled={busy}
              />

              <button
                type="submit"
                disabled={busy}
              >
                Add
              </button>
            </form>

            <div className="planner-course-chips">
              {selectedCodes.map((code) => (
                <span
                  className="planner-chip"
                  key={code}
                >
                  {code}

                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${code}`}
                    title={`Remove ${code} from semester`}
                    onClick={() =>
                      removeCourse(code)
                    }
                  >
                    ×
                  </button>
                </span>
              ))}

              {!selectedCodes.length && (
                <p className="planner-muted">
                  No courses selected yet.
                </p>
              )}
            </div>
          </div>

          <div className="planner-control-section planner-feature-section">
            <div className="planner-control-title">
              <h2>Features</h2>

              <div
                className="planner-feature-buttons"
                role="group"
                aria-label="Calendar editing tools"
              >
                <button
                  type="button"
                  className={`planner-feature-button ${
                    featureMode === "block"
                      ? "is-active"
                      : ""
                  }`}
                  aria-label="Block hours"
                  aria-pressed={
                    featureMode === "block"
                  }
                  title="Block hours: click an hour in the calendar"
                  onClick={() =>
                    setFeatureMode(
                      (current) =>
                        current === "block"
                          ? null
                          : "block"
                    )
                  }
                >
                  <BlockIcon />
                </button>

                <button
                  type="button"
                  className={`planner-feature-button ${
                    featureMode === "lock"
                      ? "is-active"
                      : ""
                  }`}
                  aria-label="Lock course index"
                  aria-pressed={
                    featureMode === "lock"
                  }
                  title="Lock course index: click a scheduled course"
                  onClick={() =>
                    setFeatureMode(
                      (current) =>
                        current === "lock"
                          ? null
                          : "lock"
                    )
                  }
                >
                  <LockIcon />
                </button>
              </div>
            </div>

            <small className="planner-muted">
              {featureMode === "block"
                ? "Click an hour to save or remove a block."
                : featureMode === "lock"
                ? "Click a class to lock its index."
                : `${
                    blockedHours.length
                  } blocked hour${
                    blockedHours.length === 1
                      ? ""
                      : "s"
                  } · ${
                    Object.keys(
                      lockedIndexes
                    ).length
                  } locked course${
                    Object.keys(
                      lockedIndexes
                    ).length === 1
                      ? ""
                      : "s"
                  }`}
            </small>
          </div>

          <div className="planner-controls-actions">
            <button
              type="button"
              className="planner-generate"
              disabled={busy || loading || !activePlanId || !selectedCodes.length}
              onClick={generate}
            >
              {busy
                ? "Working…"
                : indexes.length > 0
                ? "Regenerate Plan"
                : "Generate Plan"}
            </button>

            <button
              type="button"
              className="planner-save"
              disabled={
                busy ||
                loading ||
                !selectedCodes.length ||
                !activePlanId ||
                Boolean(activePlan?.active_selection)
              }
              onClick={savePlan}
            >
              {busy
              ? "Working…"
              : activePlan?.active_selection
              ? "Confirmed"
              : confirmedPlan
              ? "Switch Final Plan"
              : "Confirm Plan"}
            </button>
          </div>

          <div className="planner-export-row">
            <button
              type="button"
              className="planner-export"
              disabled={busy || loading || !activePlanId || !slots.length}
              onClick={exportPlan}
            >
              Export Plan
            </button>
          </div>
        </aside>
      </div>

      {requestId && activePlanId && (
        <PlannerPreferences
          key={requestId}
          requestId={requestId}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onChanged={async () => {
            setGenerationFailure(null);
            setError("");
            await reloadRequest();
          }}
        />
      )}
      <section
        className="planner-selected-panel"
        aria-label="Selected courses and indexes"
      >
        <div className="planner-selected-header">
          <div>
            <h2>
              Selected courses{" "}
              <span>
                {selected.length}
              </span>
            </h2>

            <p>
              Choose a class index for each course.
              Selected indexes appear in your calendar
              above.
            </p>
          </div>

          <button
            type="button"
            className="planner-explorer-link"
            onClick={onBackToExplorer}
          >
            + Browse courses
          </button>
        </div>

        <div className="planner-selected-meter">
          <span>
            {selectedAu}{" "}
            {planningRequest?.target_au
              ? `/ ${planningRequest.target_au}`
              : ""}{" "}
            AU
          </span>

          {planningRequest?.target_au && (
            <div className="meter">
              <span
                style={{
                  width: `${Math.min(
                    (selectedAu /
                      Number(
                        planningRequest.target_au
                      )) *
                      100,
                    100
                  )}%`,
                }}
              />
            </div>
          )}
        </div>

        <div
          className="planner-target-au-control"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "16px",
            marginBottom: "20px",
          }}
        >
          <label htmlFor="target-au-range">
            Target AU: <strong>{targetAuDraft}</strong>
          </label>

          <input
            id="target-au-range"
            type="range"
            min="3"
            max="30"
            step="1"
            value={Number(targetAuDraft)}
            onChange={(event) =>
              setTargetAuDraft(event.target.value)
            }
            disabled={!requestId || busy}
            style={{
              width: "220px",
              maxWidth: "100%",
              accentColor: "#dc1247",
              cursor: "pointer",
            }}
          />

          <button
            type="button"
            className="planner-explorer-link"
            onClick={saveTargetAu}
            disabled={
              !requestId ||
              busy ||
              Number(targetAuDraft) ===
                Number(planningRequest?.target_au)
            }
          >
            {busy ? "Saving..." : "Save Target"}
          </button>

          {Number(targetAuDraft) !==
            Number(planningRequest?.target_au) && (
            <small className="planner-muted">
              Not saved yet
            </small>
          )}
        </div>
        {selected.length ? (
          <div className="planner-selected-grid">
            {selected.map((course) => {
              const chosen = indexes.find(
                (index) =>
                  index.course_code ===
                  course.course_code
              );

              const cachedDetails = optionsByCourse[course.course_code];
              const details = cachedDetails?.context === indexContext ? cachedDetails : null;

              return (
                <article
                  className="planner-selected-card"
                  key={course.course_code}
                >
                  <div className="planner-card-title">
                    <strong>
                      {course.course_code}
                    </strong>

                    <span
                      className={`planner-index-status ${
                        chosen
                          ? "has-index"
                          : ""
                      }`}
                    >
                      {chosen ? (
                        Number(
                          lockedIndexes[
                            course.course_code
                          ]
                        ) ===
                        Number(
                          chosen.index_no
                        ) ? (
                          <>
                            <LockIcon small />{" "}
                            Locked index
                          </>
                        ) : (
                          "Index selected"
                        )
                      ) : (
                        "Needs index"
                      )}
                    </span>
                  </div>

                  <h3>
                    {course.course_name}
                  </h3>

                  <p className="planner-card-meta">
                    {course.au == null
                      ? "AU unavailable"
                      : `${Number(
                          course.au
                        )} AU`}{" "}
                    · Semester{" "}
                    {planningRequest?.semester ||
                      "—"}
                  </p>

                  <div className="planner-card-index">
                    <span>
                      Selected index
                    </span>

                    <strong>
                      {chosen
                        ? chosen.index_no
                        : "Not selected"}
                    </strong>
                  </div>

                  {chosen &&
                    Number(
                      lockedIndexes[
                        course.course_code
                      ]
                    ) ===
                      Number(
                        chosen.index_no
                      ) && (
                      <p className="planner-locked-note">
                        Index locked in this plan.
                        Use the Lock tool and click
                        the class to unlock.
                      </p>
                    )}

                  {chosen && (
                    <div className="planner-card-times">
                      {slots
                        .filter(
                          (slot) =>
                            slot.course_code ===
                            course.course_code
                        )
                        .map((slot) => (
                          <small
                            key={slot.slot_id}
                          >
                            {formatSession(slot)}
                          </small>
                        ))}
                    </div>
                  )}

                  <div className="planner-card-actions">
                    <button
                      type="button"
                      className="planner-small-action"
                      disabled={
                        busy || loading
                      }
                      onClick={() =>
                        expandIndexes(
                          course.course_code
                        )
                      }
                    >
                      {expandedCourse ===
                      course.course_code
                        ? "Hide indexes"
                        : chosen
                        ? "Change index"
                        : "Choose index"}
                    </button>

                    {chosen && (
                      <button
                        className="planner-text-action"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          clearIndex(
                            course.course_code
                          )
                        }
                      >
                        Clear index
                      </button>
                    )}

                    <button
                      className="planner-text-action planner-remove-course"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        removeCourse(
                          course.course_code
                        )
                      }
                    >
                      Remove course
                    </button>
                  </div>

                  {expandedCourse ===
                    course.course_code &&
                    (details?.loading ? (
                      <p className="planner-help">
                        Loading available
                        indexes…
                      </p>
                    ) : details?.error ? (
                      <p className="planner-help">
                        {details.error}
                      </p>
                    ) : (
                      <IndexOptions
                        course={course}
                        semester={planningRequest?.semester}
                        options={
                          details?.options ||
                          []
                        }
                        selectedIndex={
                          chosen?.index_no
                        }
                        onChoose={
                          chooseIndex
                        }
                        busy={
                          busy || loading
                        }
                      />
                    ))}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="planner-no-courses">
            <p>
              No courses selected. Add a course
              above or find one in Course Explorer.
            </p>

            <button
              type="button"
              onClick={onBackToExplorer}
            >
              Explore courses
            </button>
          </div>
        )}
      </section>

      <ReasonDialog
        problem={problem}
        onClose={() =>
          setProblem(null)
        }
      />
    </div>
  );
}
