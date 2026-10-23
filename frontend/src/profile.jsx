import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import ReasonDialog from "./ReasonDialog";
import { courseProblem, indexProblem } from "./reasonUtils";
import "./styles.css";

// Styling shared by all field labels
const labelStyle = {
  fontSize: "14px",
  fontWeight: 700,
  color: "var(--ink)",
};

// Styling shared by the dropdown menus
const selectStyle = {
  height: "48px",
  fontSize: "14px",
  fontWeight: 600,
  background: "var(--surface)",
  borderColor: "var(--line)",
  color: "var(--ink)",
};

const curriculum = [
	{ year: 1, code: "MH1810", name: "Mathematics 1", type: "Core", au: 3 },
	{ year: 1, code: "IE1005", name: "From Computational Thinking to Programming", type: "Core", au: 3 },
	{ year: 1, code: "DA1000", name: "Thinking & Communicating Visually", type: "Core", au: 3 },
	{ year: 1, code: "IM1002", name: "Analog Electronics", type: "Core", au: 3 },
	
	{ year: 2, code: "IE2108", name: "Data Structures and Algorithms", type: "Core", au: 3 },
	{ year: 2, code: "IE2104", name: "Digital Electronics", type: "Core", au: 3 },
	{ year: 2, code: "IE2106", name: "Engineering Mathematics 1", type: "Core", au: 3 },
	{ year: 2, code: "IM2073", name: "Introduction to Design and Project", type: "Core", au: 2 },
	
	{ year: 3, code: "IM3180", name: "Design & Innovation Project", type: "Core", au: 3 },
	{ year: 3, code: "IE3014", name: "Digital Signal Processing", type: "Core", au: 3 },
	{ year: 3, code: "IE3017", name: "Computer Communications", type: "Core", au: 3 },
	{ year: 3, code: "DA3000", name: "Thinking & Communicating Visually III", type: "Core", au: 3 },
	
	{ year: 4, code: "IE4001", name: "Software Engineering", type: "Core", au: 3 },
	{ year: 4, code: "IE4080", name: "Final Year Project", type: "Core", au: 8 },

]

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

const blockedHoursForSlots = (lessonSlots, blockedHours) => {
  const overlaps = [];

  for (const slot of lessonSlots) {
    for (
      let hour = FIRST_HOUR;
      hour < LAST_HOUR;
      hour += 1
    ) {
      const key = blockKey(slot.day_of_week, hour);

      if (
        blockedHours.includes(key) &&
        overlapsHour(slot, slot.day_of_week, hour)
      ) {
        overlaps.push(key);
      }
    }
  }

  return [...new Set(overlaps)];
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


function profile_con() {
	return (
	<div>
      <h1>Student profile</h1>
    </div>
	);
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

export default function StudentProfile({ student, semester, academicYear}) {
return(
	    <div style={{ padding: "14px" }}>
      <section className="hero">
	  <div>
	  <p className = "eyebrow">
	    Semester {semester} · AY {academicYear}
	  </p>
	  
	  <h1>Student Profile</h1>
	  
	  <p className="hero-copy">
	  View your academic details, degree audit
      and programme curriculum.
	  </p>
	  
	  </div>
	  </section>
	  
	  <section
		className="filter-panel"
		style={{ display: "block", marginBottom: "24px" , padding: "24px"}}
		>
		<h2 style={{ margin: "0 0 16px" }}>
			Personal Information
		</h2>
		
		<div style = {{
			display:"flex",
			alignItems: "center",
			gap: "30px",
			flexWrap: "wrap",
		}}
		> 
		<img 
		src="/profile_template.png" 
		alt="Student profile"
		style ={{
			width: "150px",
			height: "150px",
			borderRadius: "50%",
			objectFit: "cover",
			border:"2px solid var(--line)",
		}}
		/>

		</div>
		
		
		<dl className="requirements" style={{ margin: 0 }}>

		<div>
			<dt>Full Name</dt>
			<dd>{student?.student_name || "—"}</dd>
		</div>

		<div>
			<dt>Student ID</dt>
			<dd>{student?.student_id || "—"}</dd>
		</div>

		<div>
			<dt>Programme</dt>
			<dd>{student?.programme || "—"}</dd>
		</div>

		<div>
			<dt>Study Year</dt>
			<dd>
				{student?.study_year
				? `Year ${student.study_year}`
				: "—"}
			</dd>
		</div>

  </dl>
</section>

      <h2>Degree Audit</h2>
      <section
		className="filter-panel"
		style={{
		display: "block",
		padding: "24px",
		marginBottom: "24px",
  }}
	  >
	  <p className="eyebrow">
		ACADEMIC RECORD
	  </p>
	  <h2 style={{ margin: "0 0 10px" }}>
		Degree Audit
	  </h2>
	  
	  <p style={{ color: "var(--muted)" }}>
	  
	  </p>
	  
	  <div style={{ overflowX: "auto", marginTop: "20px" }}>
	  
	  <table
	  style ={{
			width: "100%",
			minWidth: "600px",
			borderCollapse: "collapse",
			textAlign: "left",
			colour:"var(--ink)",
		}}
	  >
	  
	  </table>
	  
	  
	  </div>
	  
	  </section>

      <h2>Programme Curriculum</h2>
	  
	  <section
		className="filter-panel"
		style={{
		display: "block",
		padding: "24px",
		marginBottom: "24px",
  }}
	  >
	  <p className="eyebrow">
		Academic Requirements
	  </p>
	  <h2 style={{ margin: "0 0 10px" }}>
		Programme Curriculum
	  </h2>
	  
	  <p style={{ color: "var(--muted)" }}>
	  Bachelor of Engineering (Information Engineering and Media)
	  </p>
	  
	  <div style={{ overflowX: "auto", marginTop: "20px" }}>
	  
	  <table
	  style ={{
			width: "100%",
			minWidth: "600px",
			borderCollapse: "collapse",
			textAlign: "left",
			colour:"var(--ink)",
		}}
	  >
	  
	  </table>
	  
	  
	  </div>
	  
	  </section>
    </div>
);
}

