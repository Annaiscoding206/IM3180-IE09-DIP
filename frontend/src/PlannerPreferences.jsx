import React, { useEffect, useState } from "react";
import { api } from "./api";

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
const choice = (value, values, label, onChange) => <select className="planner-preference-control" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{values.map(v => <option key={v}>{v}</option>)}</select>;

export default function PlannerPreferences({
  requestId,
  busy,
  onChanged,
  onBusy,
  onError,
}) {
  const [draft, setDraft] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    api.preferences(requestId).then(value => {
      if (!cancelled) { setDraft({ day_preferences: value.day_preferences, time_preferences: value.time_preferences, objectives: value.objectives }); setLoaded(true); }
    }).catch(e => { if (!cancelled) onError(e.message); });
    return () => { cancelled = true; };
  }, [requestId]);
  const update = (section, i, field, value) => setDraft(old => ({ ...old, [section]: old[section].map((row, j) => j === i ? { ...row, [field]: value } : row) }));
  const add = (section, row) => setDraft(old => ({ ...old, [section]: [...old[section], row] }));
  const remove = (section, i) => setDraft(old => ({ ...old, [section]: old[section].filter((_, j) => i !== j) }));
  const act = async (action, text) => {
    onBusy(true); onError(""); setMessage("");
    try { await action(); await onChanged(); setMessage(text); }
    catch (error) { onError(error.message); }
    finally { onBusy(false); }
  };
  return <details className="planner-preferences">
    <summary>Generation preferences</summary>
    <p className="planner-preference-intro">These preferences apply to all three plans. Hard rules must be met; soft rules and objectives affect which feasible timetable is preferred. Plan-specific blocked periods and locked indexes are edited directly in the calendar.</p>
    <fieldset className="planner-preference-group" disabled={busy || !loaded}>
      <legend>Day preferences</legend>
      {draft.day_preferences.map((p, i) => <div className="planner-preference-row" key={i}>
        {choice(p.day_of_week, days, "Day", v => update("day_preferences", i, "day_of_week", v))}
        {choice(p.preference_type, ["PREFER", "AVOID"], "Day preference", v => update("day_preferences", i, "preference_type", v))}
        {choice(p.constraint_level, ["HARD", "SOFT"], "Day strength", v => update("day_preferences", i, "constraint_level", v))}
        <button className="planner-preference-remove" type="button" onClick={() => remove("day_preferences", i)}>Remove</button>
      </div>)}
      <button className="planner-preference-add" type="button" onClick={() => add("day_preferences", { day_of_week: "MON", preference_type: "PREFER", constraint_level: "SOFT" })}>+ Add day rule</button>
    </fieldset>
    <fieldset className="planner-preference-group" disabled={busy || !loaded}>
      <legend>Time preferences (all days)</legend>
      {draft.time_preferences.map((p, i) => <div className="planner-preference-row" key={i}>
        <input className="planner-preference-control" aria-label="Preferred start" type="time" step="1" value={p.start_time} onChange={e => update("time_preferences", i, "start_time", e.target.value)} />
        <input className="planner-preference-control" aria-label="Preferred end" type="time" step="1" value={p.end_time} onChange={e => update("time_preferences", i, "end_time", e.target.value)} />
        {choice(p.preference_type, ["PREFER", "AVOID"], "Time preference", v => update("time_preferences", i, "preference_type", v))}
        {choice(p.constraint_level, ["HARD", "SOFT"], "Time strength", v => update("time_preferences", i, "constraint_level", v))}
        <button className="planner-preference-remove" type="button" onClick={() => remove("time_preferences", i)}>Remove</button>
      </div>)}
      <button className="planner-preference-add" type="button" onClick={() => add("time_preferences", { start_time: "09:00", end_time: "18:00", preference_type: "PREFER", constraint_level: "SOFT" })}>+ Add time rule</button>
    </fieldset>
    <fieldset className="planner-preference-group" disabled={busy || !loaded}>
      <legend>Objectives (priority 1 has greatest weight)</legend>
      {draft.objectives.map((p, i) => <div className="planner-preference-row" key={i}>
        {choice(p.objective_type, ["MINIMIZE_SCHOOL_DAYS", "MINIMIZE_GAPS"], "Objective", v => update("objectives", i, "objective_type", v))}
        <input className="planner-preference-control planner-preference-priority" aria-label="Priority" type="number" min="1" step="1" value={p.priority} onChange={e => update("objectives", i, "priority", Number(e.target.value))} />
        <button className="planner-preference-remove" type="button" onClick={() => remove("objectives", i)}>Remove</button>
      </div>)}
      <button className="planner-preference-add" type="button" onClick={() => add("objectives", { objective_type: "MINIMIZE_SCHOOL_DAYS", priority: 1 })}>+ Add objective</button>
    </fieldset>
    <div className="planner-preference-footer">
      <button className="planner-preference-save" type="button" disabled={busy || !loaded} onClick={() => act(() => api.savePreferences(requestId, draft), "Preferences saved. Existing plan rankings and final selection were invalidated if preferences changed.")}>Save preferences</button>
      {message && <p className="planner-preference-message" role="status">{message}</p>}
    </div>
  </details>;
}
