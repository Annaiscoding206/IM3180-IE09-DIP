const test = require("node:test"), assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto"), { once } = require("node:events");
const path = require("node:path");

test("Task 8: live academic-to-planning flows and deterministic Leo handoff", { skip: process.env.RUN_MYSQL_TESTS !== "1" }, async t => {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  assert.equal(process.env.DB_NAME, "stars_companion_db");
  process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
  const pool = require("../src/config/db"), plans = require("../src/services/planService"), prefs = require("../src/services/preferenceService"), audit = require("../src/services/degreeAuditService"), leo = require("../src/services/leoPlanningService");
  const { setupLeo } = require("../scripts/setupLeo.cjs"), { seedDemoCurriculum } = require("../scripts/setupCurriculum.cjs");
  const prefix = "Z" + randomBytes(3).toString("hex").toUpperCase(), student = prefix + "S", other = prefix + "O", code = letter => prefix + letter;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query("DELETE FROM student WHERE student_id IN (?, ?)", [student, other]);
      await pool.query("DELETE FROM programme_curriculum WHERE programme = ?", [prefix]);
      await pool.query("DELETE FROM course_requirement WHERE course_code = ?", [code("A")]);
      await pool.query("DELETE FROM course_info WHERE course_code IN (?)", [["P", "A", "B"].map(code)]);
    } finally { await pool.end(); }
  });
  for (const id of [student, other]) await pool.query("INSERT INTO student (student_id, student_name, programme, study_year) VALUES (?, 'Task 8 test', ?, 3)", [id, prefix]);
  for (const [letter, index, day, start, end] of [["P", 100, "FRI", "09:00", "10:00"], ["A", 101, "MON", "09:00", "10:00"], ["A", 102, "TUE", "09:00", "10:00"], ["A", 103, "MON", "13:00", "14:00"], ["B", 201, "MON", "10:00", "11:00"], ["B", 202, "TUE", "10:00", "11:00"]]) {
    await pool.query("INSERT INTO course_info (course_code,index_no,course_name,au,grading_type,academic_year,semester) VALUES (?,?,'Task 8 test',3,'LETTER_GRADED','2026-2027',1)", [code(letter), index]);
    await pool.query("INSERT INTO class_slots (course_code,index_no,class_type,class_group,day_of_week,start_time,end_time,teaching_weeks) VALUES (?,?,'LECTURE','TEST',?,?,?,'1-13')", [code(letter), index, day, start, end]);
  }
  await pool.query("INSERT INTO course_requirement (course_code,required_course_code,requirement_type,requirement_group) VALUES (?,?,'PREREQUISITE',1)", [code("A"), code("P")]);
  await audit.importDemoRecords(student, [1, 2].map(n => ({ source_key: `demo:passed${n}`, course_code: code("P"), course_title: "Passed prerequisite", academic_year: "2025-2026", semester: n, result: "PASSED", grade: null, earned_au: 3 })));
  await seedDemoCurriculum(pool, { student_id: student, curriculum: { curriculum_key: prefix, title: "Synthetic Task 8", programme: prefix, admission_year: 2024, admission_route: "DIRECT_ENTRY", is_demo: 1, description: "Synthetic integration fixture" },
    categories: [{ category_code: "CORE", title: "Core", required_au: 9 }], groups: [],
    courses: ["P", "A", "B"].map(letter => ({ course_code: code(letter), course_title: "Synthetic course", category_code: "CORE", group_code: null, is_required: 1, recommended_study_year: 3, recommended_semester: 1, verified_min_study_year: null, verification_source: null })) });
  const express = require("express"), app = express(); app.use(express.json());
  app.use((req, res, next) => { res.locals.authenticatedStudentId = student; next(); });
  for (const [route, file] of [["students", "studentRoutes"], ["courses", "courseRoutes"], ["plans", "planRoutes"], ["planning-requests", "planningRequestRoutes"]]) app.use(`/api/${route}`, require(`../src/routes/${file}`));
  app.use("/api/chat", require("../src/routes/chatRoutes"));
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(method, route, body) {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    return { status: response.status, ...await response.json() };
  }
  const request = (await http("POST", "/planning-requests", { student_id: student, academic_year: "2026-2027", semester: 1 })).data.request_id;
  const empty = () => ({ day_preferences: [], time_preferences: [], objectives: [] });
  let generated;
  await t.test("AI migration rerun is a no-op", async () => {
    const result = await setupLeo(pool); assert.deepEqual(result.applied, []); assert.equal(result.existing.length, 4);
  });
  await t.test("Flow 1: Audit completion drives Explorer and rejects reselection", async () => {
    const degree = (await http("GET", `/students/${student}/degree-audit`)).data;
    assert.deepEqual(degree.passed_course_codes, [code("P")]); assert.equal(degree.earned_au, 3);
    const course = (await http("GET", `/courses/${code("P")}`)).data;
    assert.equal(course.is_completed, true); assert.equal(course.completion_status, "Completed");
    assert.equal((await http("POST", `/plans/${request}/courses`, { course_code: code("P") })).status, 422);
  });
  await t.test("Flow 2: eligibility uses academic_record without legacy completion", async () => {
    assert.equal((await pool.query("SELECT * FROM completed_course WHERE student_id = ?", [student]))[0].length, 0);
    const result = await http("GET", `/students/${student}/eligibility/${code("A")}`);
    assert.equal(result.prerequisite_eligible, true, JSON.stringify(result));
    assert.equal((await http("POST", `/plans/${request}/courses`, { course_code: code("A") })).status, 201);
  });
  await t.test("Flow 3: curriculum progress agrees with audit; repeats count once", async () => {
    const progress = (await http("GET", `/students/${student}/curriculum/progress`)).data;
    assert.deepEqual(progress.degree_audit_summary, (await http("GET", `/students/${student}/degree-audit`)).data.summary);
    assert.equal(progress.summary.completed_au, 3); assert.equal(progress.summary.remaining_au, 6); assert.deepEqual(progress.summary.completed_required_courses, [code("P")]);
  });
  await t.test("Flow 4: selected courses, saved preferences/blocks, three distinct ranked valid plans", async () => {
    assert.equal((await http("POST", `/plans/${request}/courses`, { course_code: code("B") })).status, 201);
    assert.equal((await http("PUT", `/planning-requests/${request}/preferences`, { ...empty(), objectives: [{ objective_type: "MINIMIZE_SCHOOL_DAYS", priority: 1 }] })).status, 200);
    assert.equal((await http("POST", `/planning-requests/${request}/blocked-periods`, { day_of_week: "FRI", start_time: "12:00", end_time: "13:00" })).status, 201);
    const result = await http("POST", `/planning-requests/${request}/generate-plans`, {});
    assert.equal(result.status, 201, JSON.stringify(result)); generated = result.data.plans;
    assert.equal(generated.length, 3); assert.equal(new Set(generated.map(p => JSON.stringify(p.indexes))).size, 3); assert.deepEqual(generated.map(p => p.rank_no), [1, 2, 3]);
    for (const plan of generated) {
      const detail = (await http("GET", `/plans/${plan.plan_id}/summary`)).data;
      assert.equal(detail.validation.can_finalize, true); assert.equal(detail.indexes.length, 2); assert.equal(detail.sessions.length, 2);
      assert.ok(detail.metrics.campus_days >= 1); assert.equal(detail.metrics.match_score, Number(detail.match_score));
    }
    console.log("Task 8 generation search:", JSON.stringify(result.data.search));
  });
  await t.test("Flow 5: select, validate, reload same active timetable", async () => {
    assert.equal((await http("POST", `/plans/${generated[0].plan_id}/select`)).status, 200);
    for (let n = 0; n < 2; n++) {
      const active = (await http("GET", `/planning-requests/${request}/active-plan`)).data;
      assert.equal(active.plan.plan_id, generated[0].plan_id); assert.equal(active.plan.active_selection, true); assert.equal(active.plan.validation.can_finalize, true);
    }
  });
  const { RunContext, setTracingDisabled } = await import("@openai/agents"); setTracingDisabled(true);
  const conversation = await import("../src/services/conversationService.mjs"), { askSmartStars } = await import("../src/services/chatService.mjs");
  const { interpretTimetablePreferencesTool } = await import("../src/ai/tools/preferenceTools.mjs"), tools = await import("../src/ai/tools/planningTools.mjs");
  const { loadSelectedTimetable } = await import("../src/ai/tools/timetableTools.mjs");
  const invoke = async (tool, input, context) => JSON.parse(await tool.invoke(new RunContext(context), JSON.stringify(input)));
  const conversationId = (await conversation.createConversation({ studentId: student, title: "Task 8" })).conversation_id;
  const context = { studentId: student, conversationId, message: "draft for my request" };
  const input = { ...empty(), day_preferences: [{ day_of_week: "MON", preference_type: "PREFER", constraint_level: "SOFT" }], clarification_questions: [], academic_year: null, semester: null, request_id: request };
  await t.test("Leo tools retrieve trusted academics, request, metrics, sessions and active selection", async () => {
    for (const section of ["profile", "degree_audit", "curriculum"]) { const result = await invoke(tools.getAcademicContextTool, { section, plan_id: null }, context); assert.notEqual(result.success, false); }
    assert.ok((await invoke(tools.listPlanningRequestsTool, {}, context)).some(r => r.request_id === request));
    const data = await invoke(tools.getPlanningContextTool, { request_id: request, plan_id: null }, context);
    assert.equal(data.active.plan.plan_id, generated[0].plan_id); assert.equal(data.plans.length, 3); assert.equal(data.blocked_periods.length, 1);
    const timetable = await loadSelectedTimetable(student, null, null, request); assert.equal(timetable.status, "ok"); assert.equal(timetable.sessions.length, 2);
    assert.equal((await invoke(tools.getPlanningContextTool, { request_id: request, plan_id: null }, { ...context, studentId: other })).http_status, 404);
  });
  await t.test("unresolved/UNSPECIFIED and casual acknowledgements never authorize writes", async () => {
    const before = await prefs.getPreferences(request, student);
    const draft = await invoke(interpretTimetablePreferencesTool, { ...input, day_preferences: [{ ...input.day_preferences[0], constraint_level: "UNSPECIFIED" }] }, context);
    assert.equal(draft.status, "clarification_required"); assert.equal(draft.confirmation_command, null);
    const result = await askSmartStars({ ...context, message: `CONFIRM ${draft.draft_id} FOR REQUEST ${request}` }, { runAgent: () => { throw Error("Unexpected model call"); } });
    assert.equal(result.planning_result.code, "DRAFT_NOT_READY");
    const ready = await invoke(interpretTimetablePreferencesTool, input, context);
    assert.equal((await invoke(tools.saveConfirmedPreferencesTool, { draft_id: ready.draft_id, request_id: request }, { ...context, message: "okay" })).code, "CONFIRMATION_REQUIRED");
    assert.deepEqual(await prefs.getPreferences(request, student), before);
    assert.equal((await invoke(tools.generateTimetableTool, { request_id: request, source_plan_id: null }, context)).code, "CONFIRMATION_REQUIRED");
  });
  await t.test("website stages exact draft; Telegram confirms/generates with shared DB history", async () => {
    const staged = await askSmartStars({ ...context, message: "Prefer Monday softly" }, { runAgent: async (_, __, options) => {
      await invoke(interpretTimetablePreferencesTool, input, options.context); return { finalOutput: "Do not use model prose instead of exact draft" };
    } });
    assert.match(staged.reply, /Prefer classes on Monday \(flexible preference\)/); assert.ok(staged.preference_draft.confirmation_command);
    await conversation.setActiveConversationId({ studentId: student, conversationId });
    assert.equal(await conversation.getActiveConversationId({ studentId: student }), conversationId);
    const saved = await askSmartStars({ ...context, sourceChannel: "telegram", message: staged.preference_draft.confirmation_command + " AND GENERATE" }, { runAgent: () => { throw Error("Unexpected model call"); } });
    assert.equal(saved.planning_result.saved_to_database, true, JSON.stringify(saved)); assert.equal(saved.planning_result.generation.status, "clarification_required", "Preference changes invalidate confirmed-plan inference");
    const explicit = await askSmartStars({ ...context, message: `GENERATE REQUEST ${request} FROM PLAN ${generated[0].plan_id}` });
    assert.equal(explicit.planning_result.timetable_generated, true); assert.equal(explicit.planning_result.plans.length, 3);
    assert.equal((await prefs.getPreferences(request, student)).day_preferences[0].day_of_week, "MON");
    const history = await conversation.getConversationMessages({ studentId: student, conversationId, limit: 30 });
    assert.ok(history.some(m => m.source_channel === "website")); assert.ok(history.some(m => m.source_channel === "telegram"));
    assert.equal((await http("GET", `/planning-requests/${request}/active-plan`)).data.plan, null);
    assert.equal((await askSmartStars({ ...context, message: staged.preference_draft.confirmation_command })).planning_result.code, "DRAFT_NOT_READY");
  });
  await t.test("superseded drafts and foreign request/conversation bindings fail closed", async () => {
    const first = await invoke(interpretTimetablePreferencesTool, input, context); await invoke(interpretTimetablePreferencesTool, input, context);
    await assert.rejects(leo.confirmPreferenceDraft({ ...context, message: first.confirmation_command }, first.draft_id, request), e => e.details.code === "STALE_DRAFT");
    const foreign = (await plans.createRequest({ student_id: other, academic_year: "2026-2027", semester: 1 })).request_id;
    assert.equal((await invoke(interpretTimetablePreferencesTool, { ...input, request_id: foreign }, context)).http_status, 404);
    const foreignConversation = (await conversation.createConversation({ studentId: other })).conversation_id;
    assert.equal((await invoke(interpretTimetablePreferencesTool, input, { ...context, conversationId: foreignConversation })).http_status, 404);
  });
  await t.test("HTTP chat confirms a bound draft and empty interpretation cancels pending token", async () => {
    let draft = await invoke(interpretTimetablePreferencesTool, input, context);
    const saved = await http("POST", "/chat", { message: draft.confirmation_command, conversationId });
    assert.equal(saved.status, 200); assert.equal(saved.planning_result.saved_to_database, true);
    draft = await invoke(interpretTimetablePreferencesTool, input, context);
    await invoke(interpretTimetablePreferencesTool, { ...empty(), clarification_questions: [], academic_year: null, semester: null, request_id: request }, context);
    assert.equal(await leo.readDraft(context), null);
    const rejected = await http("POST", "/chat", { message: draft.confirmation_command, conversationId });
    assert.equal(rejected.planning_result.code, "STALE_DRAFT");
    assert.equal((await prefs.getPreferences(request, student)).day_preferences[0].day_of_week, "MON");
  });
  await t.test("failed confirmation rolls back saved preferences and draft status", async () => {
    const draft = await invoke(interpretTimetablePreferencesTool, { ...input, day_preferences: [{ ...input.day_preferences[0], day_of_week: "WED" }] }, context), before = await prefs.getPreferences(request, student);
    const db = await pool.getConnection(), get = pool.getConnection, query = db.query, release = db.release;
    pool.getConnection = async () => db; db.release = () => {};
    db.query = function(sql, args) { if (sql.startsWith("INSERT INTO planning_day_preference")) throw Error("Injected preference failure"); return query.call(this, sql, args); };
    try { await assert.rejects(leo.confirmPreferenceDraft({ ...context, message: draft.confirmation_command }, draft.draft_id, request), /Injected preference failure/); }
    finally { pool.getConnection = get; db.query = query; db.release = release; db.release(); }
    assert.deepEqual(await prefs.getPreferences(request, student), before); assert.equal((await leo.readDraft(context)).status, "ready_for_confirmation");
  });
  await t.test("Leo returns existing structured no-plan reasons and remedies", async () => {
    await prefs.replacePreferences(request, student, { ...empty(), day_preferences: [{ day_of_week: "SUN", preference_type: "PREFER", constraint_level: "HARD" }] });
    const result = await askSmartStars({ ...context, message: `GENERATE REQUEST ${request} FROM PLAN ${generated[0].plan_id}` });
    assert.equal(result.planning_result.code, "NO_FEASIBLE_PLAN"); assert.equal(result.planning_result.success, false);
    assert.ok(result.planning_result.reasons.some(r => r.code === "HARD_DAY_CONSTRAINT")); assert.ok(result.planning_result.suggestions.length);
    assert.equal((await loadSelectedTimetable(student, null, null, request)).status, "no_selected_plan");
  });
  await t.test("persistent locks constrain generation; archived writes and stale active selection rejected", async () => {
    await prefs.replacePreferences(request, student, empty());
    const result = await http("POST", `/planning-requests/${request}/generate-plans`, {}), source = result.data.plans[0], chosen = source.indexes[0];
    assert.equal((await http("PUT", `/plans/${source.plan_id}/indexes/${chosen.course_code}/lock`, { locked: true })).status, 200);
    assert.equal((await http("POST", `/planning-requests/${request}/generate-plans`, {})).code, "SOURCE_PLAN_REQUIRED");
    const locked = await http("POST", `/planning-requests/${request}/generate-plans`, { source_plan_id: source.plan_id });
    for (const plan of locked.data.plans) assert.equal(plan.indexes.find(i => i.course_code === chosen.course_code).index_no, chosen.index_no);
    assert.equal((await http("PUT", `/plans/${generated[0].plan_id}/indexes/${code("A")}/lock`, { locked: true })).status, 409);
    const current = locked.data.plans[0].plan_id; assert.equal((await http("POST", `/plans/${current}/select`)).status, 200);
    await pool.query("UPDATE academic_record SET result = 'FAILED', earned_au = 0 WHERE student_id = ?", [student]);
    const active = (await http("GET", `/planning-requests/${request}/active-plan`)).data;
    assert.equal(active.plan, null); assert.ok(active.stale_plan_ids.includes(current));
    assert.equal((await loadSelectedTimetable(student, null, null, request)).status, "no_selected_plan");
  });
});
