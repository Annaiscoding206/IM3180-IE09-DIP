import React, { useEffect, useMemo, useState } from "react";
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
function WeeklyCalendar({
  slots,
  mode,
  blockedHours,
  lockedIndexes,
  onHourClick,
  onLessonClick,
  busy,
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
            (LAST_HOUR - FIRST_HOUR) * PIXELS_PER_HOUR
          }px`,
          "--planner-hour-height": `${PIXELS_PER_HOUR}px`,
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
                  (hour - FIRST_HOUR) * PIXELS_PER_HOUR
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
                  COURSE_COLORS[
                    colors.indexOf(slot.course_code) %
                      COURSE_COLORS.length
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
                        PIXELS_PER_HOUR
                      }px`,
                      height: `${Math.max(
                        21,
                        ((clippedEnd - clippedStart) /
                          60) *
                          PIXELS_PER_HOUR -
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
                      <strong>{slot.course_code}</strong>

                      {locked && (
                        <span
                          className="planner-lesson-lock"
                          title="Index locked"
                        >
                          <LockIcon small />
                        </span>
                      )}
                    </span>

                    <span>
                      {shortTime(slot.start_time)}–
                      {shortTime(slot.end_time)}
                    </span>

                    <small>
                      {slot.venue || "Venue TBA"}
                    </small>
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
  options,
  selectedIndex,
  onlyVacancies,
  onChoose,
  busy,
}) {
  const choices = options.filter(
    (index) =>
      !onlyVacancies || Number(index.vacancy) > 0
  );

  return (
    <div className="planner-index-options">
      <p className="planner-help">
        Choose an index for {course.course_code}. The
        backend checks clashes before saving.
      </p>

      {choices.length ? (
        choices.map((index) => {
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
          No indexes match the filters.
        </p>
      )}
    </div>
  );
}

export default function Planner({
  planningRequest,
  selectedCodes,
  courses,
  onAddCourse,
  onRemoveCourse,
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
  const [onlyVacancies, setOnlyVacancies] = useState(false);
  const [featureMode, setFeatureMode] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [generationFailure, setGenerationFailure] = useState(null);
  const generationIssue = generationFailure ? generationProblem(generationFailure) : null;
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Compare the generated alternatives in the main A/B/C table. Keep manual
  // plans in state so they remain editable and selectable in their own area.
  const comparisonRows = generatedPlanEntries.length
    ? comparisons.filter((comparison) =>
        generatedPlanEntries.some(
          ({ plan }) => Number(plan.plan_id) === Number(comparison.plan_id)
        )
      )
    : comparisons;

  const blockedHours = DAYS.flatMap(day => Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => i + FIRST_HOUR)
    .filter(hour => blocks.some(block => overlapsHour(block, day, hour))).map(hour => blockKey(day, hour)));
  const lockedIndexes = Object.fromEntries(indexes.filter(i => i.locked).map(i => [i.course_code, i.index_no]));
  const reloadRequest = async () => {
    const [nextBlocks, nextPlans] = await Promise.all([api.blocks(requestId), api.plans(requestId)]);
    setBlocks(nextBlocks); setPlans(nextPlans.filter(p => p.status !== "ARCHIVED"));
    const details = await Promise.all(nextPlans.filter(p => p.status !== "ARCHIVED").map(p => api.planSummary(p.plan_id)));
    setComparisons(details);
    if (activePlanId) setSummary(details.find(p => p.plan_id === activePlanId) ?? null);
  };
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    api.blocks(requestId).then(value => { if (!cancelled) setBlocks(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [requestId]);
  const toggleHourBlock = async (day, hour) => {
    if (featureMode !== "block" || busy) return;
    const start = `${String(hour).padStart(2, "0")}:00:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00:00`;
    const exact = blocks.find(b => b.day_of_week === day && b.start_time === start && b.end_time === end);
    if (!exact && blocks.some(b => overlapsHour(b, day, hour))) {
      setError("This hour contains a partial or longer blocked period. Remove it in Preferences and blocked periods."); return;
    }
    setBusy(true); setError("");
    try {
      if (exact) await api.removeBlock(requestId, exact.block_id);
      else await api.addBlock(requestId, { day_of_week: day, start_time: start, end_time: end });
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
      const result = await api.generatePlans(requestId, activePlanId);
      await reloadRequest();
      setActivePlanId(result.plans[0].plan_id);
      setNotice(
        `Generated ${result.plans.length} timetable option(s). Review the alternatives, then confirm your preferred plan.`
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

        if (!next.length) {
          let number = 1;
          while (existing.some(p => p.plan_name === `Plan ${number}`)) number++;
          try {
            next = [
              await api.createPlan(
                requestId,
                `Plan ${number}`
              ),
            ];
          } catch (createError) {
            if (createError.status !== 409) {
              throw createError;
            }

            next = (await api.plans(requestId)).filter(p => p.status !== "ARCHIVED");
            if (!next.length) throw createError;
          }
        }

        if (!cancelled) {
          const details = await Promise.all(next.map(p => api.planSummary(p.plan_id)));
          if (cancelled) return;
          setComparisons(details);
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
            setActivePlanId(
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
        const [savedIndexes, timetable, detail] =
          await Promise.all([
            api.planIndexes(activePlanId),
            api.planTimetable(activePlanId),
            api.planSummary(activePlanId),
          ]);

        if (!cancelled) {
          setIndexes(savedIndexes);
          setSlots(timetable.data);
          setTimetableMeta(timetable);
          setSummary(detail);
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
    setActivePlanId(nextPlanId);
  };

  const expandIndexes = async (code) => {
    if (expandedCourse === code) {
      setExpandedCourse(null);
      return;
    }

    setExpandedCourse(code);

    if (optionsByCourse[code]) return;

    setOptionsByCourse((current) => ({
      ...current,
      [code]: { loading: true },
    }));

    try {
      const detail = await api.course(code);

      const options = await Promise.all(
        (detail.indexes || []).map(async (index) => {
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

      setOptionsByCourse((current) => ({
        ...current,
        [code]: {
          loading: false,
          options,
        },
      }));
    } catch (loadError) {
      setOptionsByCourse((current) => ({
        ...current,
        [code]: {
          loading: false,
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
      await onAddCourse(code);
      await reloadRequest();

      setCourseInput("");
      setNotice(
        `${code} added to your semester.`
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
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await onRemoveCourse(code);

      setExpandedCourse((current) =>
        current === code ? null : current
      );

      setOptionsByCourse((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });

      try {
        const [
          savedIndexes,
          timetable,
          refreshedPlans,
        ] = await Promise.all([
          api.planIndexes(activePlanId),
          api.planTimetable(activePlanId),
          api.plans(requestId),
        ]);

        setIndexes(savedIndexes);
        setSlots(timetable.data);
        setTimetableMeta(timetable);
        setPlans(refreshedPlans.filter(p => p.status !== "ARCHIVED"));
        await reloadRequest();

        setNotice(
          `${code} and its indexes were removed from all plans.`
        );
      } catch {
        setNotice(
          `${code} was removed. Refresh the page if the timetable does not update immediately.`
        );
      }
    } catch (changeError) {
      setError(changeError.message);

      try {
        await refreshTimetable();
      } catch {
        // Keep the original removal error.
      }
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
            Organise your selected courses and compare
            up to three possible timetables.
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

      {error && (
        <div
          className="planner-alert planner-alert-error"
          role="alert"
        >
          {error}
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

          <div className="planner-control-section">
            <div className="planner-control-title">
              <h2>Filters</h2>

              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-label={
                  filtersOpen
                    ? "Collapse filters"
                    : "Expand filters"
                }
                className="planner-filter-toggle"
                onClick={() =>
                  setFiltersOpen(
                    (current) => !current
                  )
                }
              >
                <svg
                  className={
                    filtersOpen
                      ? "is-open"
                      : ""
                  }
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>

            {filtersOpen && (
              <label className="planner-control-check">
                <input
                  type="checkbox"
                  checked={onlyVacancies}
                  onChange={(event) =>
                    setOnlyVacancies(
                      event.target.checked
                    )
                  }
                />

                Indexes with vacant places only
              </label>
            )}
          </div>

          <div className="planner-control-section">
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
              disabled={busy || loading || !requestId || !selectedCodes.length}
              onClick={generate}
            >
              {busy
                ? "Working…"
                : generatedPlanEntries.length > 0
                ? "Regenerate Plans"
                : "Generate Plans"}
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

          <p className="planner-control-help">
            Blocks and index changes are saved immediately. Locked indexes are preserved when generating from the displayed plan. Confirm Plan validates and selects your final timetable; this does not register you for NTU courses.
          </p>
        </aside>
      </div>

      {comparisonRows.length > 0 && <div className="planner-comparison"><table>
        <caption>Plan comparison — current saved preferences</caption>
        <thead><tr><th>Plan</th><th>Rank</th><th>Saved score</th><th>Campus days</th><th>Gap minutes</th><th>Validation</th></tr></thead>
        <tbody>{comparisonRows.map(p => <tr key={p.plan_id}><td>{p.plan_name.replace(/^AUTO (Plan [ABC]) #\d+$/, "$1")}{p.active_selection ? " (final choice)" : ""}</td><td>{p.rank_no ?? "—"}</td><td>{p.match_score ?? "—"}</td><td>{p.metrics?.campus_days ?? "—"}</td><td>{p.metrics?.total_gap_minutes ?? "—"}</td><td>{p.validation.can_finalize ? "Ready" : "Needs review"}</td></tr>)}</tbody>
      </table></div>}
      {requestId && <PlannerPreferences key={requestId} requestId={requestId} blocks={blocks} busy={busy}
        onBusy={setBusy} onError={setError} onChanged={reloadRequest} />}
      {summary?.metrics && <p className="planner-control-help">{summary.label}: rank {summary.rank_no ?? "unranked"} · saved score {summary.match_score ?? "not ranked"} · {summary.metrics.campus_days} campus days · {summary.metrics.total_gap_minutes} gap minutes · {summary.validation.can_finalize ? "Ready to finalize" : "Needs review"}. Metrics reflect saved preferences.</p>}
      {generationIssue && <div role="alert" className="planner-preferences">
        <strong>{generationIssue.summary}</strong>
        <ul>{generationIssue.reasons.map((reason, index) => <li key={index}>
          {reason.course_code && <strong>{reason.course_code}: </strong>}
          {reason.explanation}
          {reason.indexes.length > 0 && (" Affected indexes: " + reason.indexes.join(", ") + ".")}
        </li>)}</ul>
        {generationIssue.suggestions.length > 0 && <ul>
          {generationIssue.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}
        </ul>}
        <details>
          <summary>View detailed reasons</summary>
          <p>{generationFailure.code}</p>
          {(generationFailure.reasons || []).map((reason, index) => <p key={index}>
            {[reason.course_code, reason.index_no != null ? "index " + reason.index_no : "",
              reason.day, reason.code].filter(Boolean).join(" · ")}: {reason.explanation || reason.message}
          </p>)}
        </details>
      </div>}
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

              const details =
                optionsByCourse[
                  course.course_code
                ];

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
                        options={
                          details?.options ||
                          []
                        }
                        selectedIndex={
                          chosen?.index_no
                        }
                        onlyVacancies={
                          onlyVacancies
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
