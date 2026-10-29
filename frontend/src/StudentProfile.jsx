import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { createLatestRequest } from "./planningContext";
import "./student-profile.css";

const value = input => input === null || input === undefined || input === "" ? "Not recorded" : input;
const decision = input => input === true ? "Yes" : input === false ? "No" : "Unknown";
const codes = input => input?.length ? input.join(", ") : "None";

// Each section owns its request, retry and error. Keying the visible state also
// hides old-plan data during the render before the next effect starts.
function useResource(request, key, enabled = true) {
  const latest = useRef(createLatestRequest());
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({});
  const requestKey = `${key}:${attempt}:${enabled}`;
  useEffect(() => {
    if (enabled) {
      setState({ key: requestKey, loading: true });
      latest.current.load(request,
        data => setState({ key: requestKey, data }),
        error => setState({ key: requestKey, error }));
    }
    return () => latest.current.invalidate();
  }, [request, requestKey, enabled]);
  return { ...(state.key === requestKey ? state : { loading: true }), retry() {
    latest.current.invalidate();
    setAttempt(n => n + 1);
  } };
}

function Resource({ state, label, children }) {
  if (state.loading) return <p role="status">Loading {label}…</p>;
  if (state.error) {
    const error = state.error, code = error.details?.code;
    let title = `Could not load ${label}`;
    if (code === "NO_CURRICULUM") title = "No matching curriculum";
    else if (code === "AMBIGUOUS_CURRICULUM") title = "Curriculum match needs review";
    else if ([401, 403].includes(error.status)) title = "Student access required";
    else if (error.status === 404) title = "Student or planning context unavailable";
    return <div className="profile-feedback" role="alert">
      <strong>{title}</strong>
      <p>{error.message || "The request failed. Please try again."}</p>
      {code && <p className="profile-code">{code}</p>}
      <button type="button" onClick={state.retry}>Retry {label}</button>
    </div>;
  }
  return children(state.data);
}

function Table({ label, headings, children }) {
  return <div className="profile-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table><caption>{label}</caption>
      <thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

function PersonalInformation({ student }) {
  if (!student) return <p>No personal information is available.</p>;
  const initials = student.student_name?.trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "—";
  return <div className="profile-personal">
    <span className="sidebar-avatar profile-avatar" aria-hidden="true">{initials}</span>
    <dl className="profile-fields">
      {[["Student name", student.student_name], ["Student ID", student.student_id],
        ["Programme", student.programme], ["Study year", student.study_year],
        ["Admission year / cohort", student.admission_year], ["Admission route", student.admission_route]]
        .map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{value(content)}</dd></div>)}
    </dl>
  </div>;
}

function DegreeAudit({ audit }) {
  if (!audit) return <p>No Degree Audit is available.</p>;
  const summary = audit.summary;
  return <>
    {summary && <>
      <dl className="profile-fields profile-metrics">
        <div><dt>Passed courses</dt><dd>{value(summary.passed_course_count)}</dd></div>
        <div><dt>Earned AU{summary.earned_au_complete === false ? " (known subtotal)" : ""}</dt><dd>{value(summary.earned_au)}</dd></div>
        <div><dt>Earned AU complete</dt><dd>{decision(summary.earned_au_complete)}</dd></div>
      </dl>
      {summary.earned_au_complete === false && <p className="profile-warning">Earned AU is incomplete. Unknown credit for: {codes(summary.unknown_au_course_codes)}. Unknown AU is not counted as a known zero.</p>}
    </>}
    {!audit.records?.length ? <p>No academic attempts recorded yet.</p> :
      <Table label="Academic attempts" headings={["Course code", "Course title", "Academic year", "Semester", "Result", "Grade", "Earned AU"]}>
        {audit.records.map(record => <tr key={record.record_id}>
          <th scope="row">{record.course_code}</th><td>{value(record.course_title)}</td>
          <td>{value(record.academic_year)}</td><td>{value(record.semester)}</td>
          <td><span className={`profile-badge result-${record.result}`}>{record.result}</span></td>
          <td>{value(record.grade)}</td><td>{record.earned_au == null ? "Unknown" : record.earned_au}</td>
        </tr>)}
      </Table>}
    <p className="profile-help">All attempts are shown. Completion and earned AU come from the student-wide backend summary.</p>
  </>;
}

function Progress({ progress }) {
  if (!progress) return null;
  return <>
    <dl className="profile-fields profile-metrics">
      <div><dt>Required AU</dt><dd>{value(progress.required_au)}</dd></div>
      <div><dt>Completed AU{progress.au_complete === false ? " (known subtotal)" : ""}</dt><dd>{value(progress.completed_au)}</dd></div>
      <div><dt>Remaining AU{progress.remaining_au_is_upper_bound ? " (upper bound)" : ""}</dt><dd>{value(progress.remaining_au)}</dd></div>
      <div><dt>AU complete</dt><dd>{decision(progress.au_complete)}</dd></div>
      {Object.hasOwn(progress, "requirements_satisfied") && <div><dt>Requirements satisfied</dt><dd>{decision(progress.requirements_satisfied)}</dd></div>}
    </dl>
    {progress.au_complete === false && <p className="profile-warning">Credit is incomplete for: {codes(progress.unknown_au_course_codes)}. Remaining AU may decrease when missing credit is recorded.</p>}
    <dl className="profile-requirements">
      <div><dt>Completed requirements</dt><dd>{codes(progress.completed_required_courses)}</dd></div>
      <div><dt>Remaining requirements</dt><dd>{codes(progress.remaining_required_courses)}</dd></div>
    </dl>
  </>;
}

function Curriculum({ data }) {
  if (!data?.curriculum) return <p>No curriculum is available.</p>;
  const context = data.planning_context;
  return <>
    <div className="profile-context" aria-label="Planning context">
      <strong>{context?.scope === "EXPLICIT_PLAN"
        ? `Working plan: ${context.plan_name || "Unnamed plan"} · Plan ${context.plan_id}`
        : context?.scope === "ACADEMIC_ONLY" ? "Academic-only context · No working plan" : "Planning context unavailable"}</strong>
      {context?.scope === "EXPLICIT_PLAN" && <p>Request {context.request_id} · AY {value(context.academic_year)} · Semester {value(context.semester)} · {value(context.plan_status)}</p>}
      <p>Planned status and selection-dependent eligibility use this context. Completed courses and AU remain student-wide.</p>
    </div>
    <h3>{data.curriculum.title}</h3>
    <p className="profile-help">Curriculum: {value(data.curriculum.curriculum_key ?? data.curriculum.curriculum_id)}</p>
    <dl className="profile-fields">
      <div><dt>Programme</dt><dd>{value(data.matching?.programme)}</dd></div>
      <div><dt>Admission year</dt><dd>{value(data.matching?.admission_year)}</dd></div>
      <div><dt>Admission route</dt><dd>{value(data.matching?.admission_route)}</dd></div>
    </dl>
    {Boolean(data.curriculum.is_demo) && <p className="profile-warning">This curriculum is a synthetic prototype, not an official graduation audit.</p>}
    <h3>Overall requirements</h3><Progress progress={data.summary} />
    {data.unallocated_passed_course_codes?.length > 0 && <p className="profile-help">Passed courses outside this curriculum: {codes(data.unallocated_passed_course_codes)}</p>}
    <div className="profile-categories">
      {!data.categories?.length && <p>No curriculum categories recorded.</p>}
      {data.categories?.map(category => <section className="profile-category" key={category.category_code} aria-label={`${category.category_code} requirements`}>
        <h3>{category.category_code} · {category.title}</h3><Progress progress={category} />
        {category.elective_groups?.length > 0 && <>
          <h4>Elective groups</h4>
          {category.elective_groups.map(group => <div className="profile-group" key={group.group_code}>
            <h4>{group.group_code} · {group.title}</h4><Progress progress={group} />
          </div>)}
        </>}
      </section>)}
    </div>
    <h3>Curriculum courses</h3>
    <p className="profile-help">Course status and eligibility are separate. A planned course may still have unmet eligibility requirements.</p>
    {!data.courses?.length ? <p>No curriculum courses recorded.</p> :
      <Table label="Curriculum course status and eligibility" headings={["Course", "Category / group", "Status", "Eligible", "Can select", "Eligibility explanation"]}>
        {data.courses.map(course => <tr key={course.course_code}>
          <th scope="row">{course.course_code}<span className="profile-course-title">{value(course.course_title)}</span></th>
          <td>{course.category_code}{course.group_code ? ` / ${course.group_code}` : ""}</td>
          <td><span className={`profile-badge status-${course.status}`}>{value(course.status)}</span></td>
          <td>{decision(course.eligible)}</td><td>{decision(course.can_select)}</td>
          <td>{course.eligibility?.requires_review && <strong>Review required. </strong>}{course.eligibility?.message || "Eligibility explanation unavailable."}</td>
        </tr>)}
      </Table>}
  </>;
}

export default function StudentProfile({ studentId, workingPlanId = null, selectionRevision = 0,
  planningLoading = false, planningError = "", onRetryPlanning }) {
  const studentRequest = useCallback(() => api.student(studentId), [studentId]);
  const auditRequest = useCallback(() => api.degreeAudit(studentId), [studentId]);
  const curriculumRequest = useCallback(() => api.curriculumProgress(studentId, workingPlanId), [studentId, workingPlanId]);
  const personal = useResource(studentRequest, studentId);
  const audit = useResource(auditRequest, studentId);
  const curriculum = useResource(curriculumRequest, `${studentId}:${workingPlanId}:${selectionRevision}`, !planningLoading && !planningError);
  const curriculumState = planningLoading ? { loading: true } : planningError
    ? { error: { message: `Planning context could not be loaded: ${planningError}` }, retry: onRetryPlanning }
    : curriculum;
  return <div className="student-profile">
    <section className="hero"><div><p className="eyebrow">Academic record</p><h1>Student Profile</h1>
      <p className="hero-copy">Your personal information, academic attempts and programme requirements.</p></div></section>
    <section className="profile-panel" aria-labelledby="profile-personal-title">
      <h2 id="profile-personal-title">Personal Information</h2>
      <Resource state={personal} label="personal information">{data => <PersonalInformation student={data} />}</Resource>
    </section>
    <section className="profile-panel" aria-labelledby="profile-audit-title">
      <p className="eyebrow">Student-wide completion</p><h2 id="profile-audit-title">Degree Audit</h2>
      <Resource state={audit} label="Degree Audit">{data => <DegreeAudit audit={data} />}</Resource>
    </section>
    <section className="profile-panel" aria-labelledby="profile-curriculum-title">
      <p className="eyebrow">Academic requirements</p><h2 id="profile-curriculum-title">Programme Curriculum</h2>
      <Resource state={curriculumState} label="Curriculum">{data => <Curriculum data={data} />}</Resource>
    </section>
  </div>;
}
