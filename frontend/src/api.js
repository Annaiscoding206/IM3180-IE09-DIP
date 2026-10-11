const request = async (path) => {
  const response = await fetch(`/api${path}`, { headers: { Accept: "application/json" } });
  let body;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) throw new Error("The backend API is not reachable.");
    throw new Error("The backend returned an unreadable response.");
  }
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return body;
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
};
