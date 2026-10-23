// Shared backend helpers for Course Explorer and My Planner.
// Keep the response envelopes used by the existing Course Explorer.
const request = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The backend API is not reachable. Start the backend and MySQL, then refresh.");
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("The backend returned an unreadable response.");
  }
  if (!response.ok || body.success === false) {
    const error = new Error(body.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
};

const json = (method, path, data) => request(path, {
  method,
  ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
});

// Automatically remove a course and its indexes from all plans
const removeCourseEverywhere = async (requestId, code) => {
  const coursePath = `/plans/${requestId}/courses/${encodeURIComponent(code)}`;

  try {
    return await json("DELETE", coursePath);
  } catch (error) {
    const affectedPlans = error.details?.affected_plans;

    if (
      error.status !== 409 ||
      !Array.isArray(affectedPlans) ||
      !affectedPlans.length
    ) {
      throw error;
    }

    // Remove the course's index from every affected plan
    for (const plan of affectedPlans) {
      try {
        await json(
          "DELETE",
          `/plans/${plan.plan_id}/indexes/${encodeURIComponent(code)}`
        );
      } catch (indexError) {
        if (indexError.status !== 404) {
          throw indexError;
        }
      }
    }

    // Remove the course after its indexes are cleared
    return json("DELETE", coursePath);
  }
};

export const api = {
  courses: () => request("/courses").then((body) => body.data),
  course: (code) => request(`/courses/${encodeURIComponent(code)}`).then((body) => body.data),
  timetable: (code, indexNo) => request(`/courses/${encodeURIComponent(code)}/indexes/${indexNo}/timetable`).then((body) => body.data),
  student: (studentId) => request(`/students/${encodeURIComponent(studentId)}`).then((body) => body.data),
  eligibility: (studentId, code, requestId) => {
    const query = requestId ? `?request_id=${requestId}` : "";
    return request(`/students/${encodeURIComponent(studentId)}/eligibility/${encodeURIComponent(code)}${query}`);
  },
  planningRequests: (studentId) => request(`/planning-requests?student_id=${encodeURIComponent(studentId)}`).then((body) => body.data),
  planningRequest: (requestId) => request(`/planning-requests/${requestId}`).then((body) => body.data),

  // New methods use the documented planning endpoints; a request ID is NOT a plan ID.
  createPlanningRequest: (data) => json("POST", "/planning-requests", data).then((body) => body.data),
  selectedCourses: (requestId) => request(`/plans/${requestId}/courses`).then((body) => body.data),
  addSelectedCourse: (requestId, code) => json("POST", `/plans/${requestId}/courses`, { course_code: code }),
  removeSelectedCourse: (requestId, code) => json("DELETE", `/plans/${requestId}/courses/${encodeURIComponent(code)}`),
  removeCourseEverywhere,
  plans: (requestId) => request(`/planning-requests/${requestId}/plans`).then((body) => body.data),
  createPlan: (requestId, name) => json("POST", `/planning-requests/${requestId}/plans`, { plan_name: name }).then((body) => body.data),
  preferences: (id) => request(`/planning-requests/${id}/preferences`).then(b => b.data),
  savePreferences: (id, data) => json("PUT", `/planning-requests/${id}/preferences`, data).then(b => b.data),
  blocks: (id) => request(`/planning-requests/${id}/blocked-periods`).then(b => b.data.blocked_periods),
  addBlock: (id, data) => json("POST", `/planning-requests/${id}/blocked-periods`, data).then(b => b.data),
  removeBlock: (id, blockId) => json("DELETE", `/planning-requests/${id}/blocked-periods/${blockId}`),
  clearBlocks: (id) => json("DELETE", `/planning-requests/${id}/blocked-periods`),
  generatePlans: (id, sourcePlanId) => json("POST", `/planning-requests/${id}/generate-plans`, sourcePlanId ? { source_plan_id: sourcePlanId } : {}).then(b => b.data),
  updateTargetAu: (requestId, targetAu) =>
  json(
    "PATCH",
    `/planning-requests/${requestId}/target-au`,
    { target_au: targetAu }
  ).then(body => body.data),
  activePlan: (id) => request(`/planning-requests/${id}/active-plan`).then(b => b.data),
  planSummary: (id) => request(`/plans/${id}/summary`).then(b => b.data),
  lockIndex: (id, code, locked) => json("PUT", `/plans/${id}/indexes/${encodeURIComponent(code)}/lock`, { locked }).then(b => b.data),
  planIndexes: (planId) => request(`/plans/${planId}/indexes`).then((body) => body.data),
  planTimetable: (planId) => request(`/plans/${planId}/timetable`),
  previewIndex: (planId, code, indexNo) => json("POST", `/plans/${planId}/clash-check`, { course_code: code, index_no: Number(indexNo) }).then((body) => body.data),
  putIndex: (planId, code, indexNo) => json("PUT", `/plans/${planId}/indexes/${encodeURIComponent(code)}`, { index_no: Number(indexNo) }).then((body) => body.data),
  removeIndex: (planId, code) => json("DELETE", `/plans/${planId}/indexes/${encodeURIComponent(code)}`).then((body) => body.data),
  validatePlan: (planId) => request(`/plans/${planId}/validation`).then((body) => body.data),
  selectPlan: (planId) => json("POST", `/plans/${planId}/select`).then((body) => body.data),
  // AI Chatbot — general academic questions.
  // Student identity is never supplied by the browser.
  askChat: (message) =>
    json("POST", "/chat", { message }),
  // Leo Assistant — retrieve the active conversation
  // and messages shared between website and Telegram.
  getActiveChat: () =>
    request("/chat/active"),
  // Independent plan course selections
  planSelectedCourses: (planId) =>
    request(`/plans/${planId}/selected-courses`)
      .then((body) => body.data),

  addPlanSelectedCourse: (planId, code) =>
    json("POST", `/plans/${planId}/selected-courses`, {
      course_code: code,
    }).then((body) => body.data),

  removePlanSelectedCourse: (planId, code) =>
    json(
      "DELETE",
      `/plans/${planId}/selected-courses/${encodeURIComponent(code)}`
    ).then((body) => body.data),

  // Independent plan blocked periods
  planBlocks: (planId) =>
    request(`/plans/${planId}/blocked-periods`)
      .then((body) => body.data.blocked_periods),

  addPlanBlock: (planId, data) =>
    json("POST", `/plans/${planId}/blocked-periods`, data)
      .then((body) => body.data),

  removePlanBlock: (planId, blockId) =>
    json("DELETE", `/plans/${planId}/blocked-periods/${blockId}`)
      .then((body) => body.data),

  clearPlanBlocks: (planId) =>
    json("DELETE", `/plans/${planId}/blocked-periods`)
      .then((body) => body.data),
};
