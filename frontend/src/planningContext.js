// One generation token covers the entire refresh, including errors. Invalidating
// on a switch/mutation prevents an older plan's response from being committed.
export function createLatestRequest() {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async load(request, onData, onError) {
      const current = ++generation;
      try {
        const data = await request();
        if (current === generation) onData(data);
      } catch (error) {
        if (current === generation) onError(error);
      }
    },
  };
}

export function createPlanningContextLoader(api) {
  const latest = createLatestRequest();
  return {
    invalidate: latest.invalidate,
    load(studentId, planId, onData, onError, requestId = null) {
      return latest.load(async () => {
        const [courses, curriculum] = await Promise.all([
          api.courses(planId, requestId),
          api.curriculum(studentId, planId).catch(error => {
            if (['NO_CURRICULUM', 'AMBIGUOUS_CURRICULUM'].includes(error.details?.code)) return null;
            throw error;
          }),
        ]);
        const curriculumCourses = new Map((curriculum?.courses || []).map(c => [c.course_code, c]));
        const annotated = await Promise.all(courses.map(async course => {
          const requirement = curriculumCourses.get(course.course_code);
          const eligibility = requirement?.eligibility ?? await api.eligibility(studentId, course.course_code, planId);
          return { ...course, eligibility,
            ...(requirement ? { curriculum_status: requirement.status } : {}) };
        }));
        return { courses: annotated, curriculum };
      }, onData, onError);
    },
  };
}

// Index choices belong to an exact planning term; course visibility is separate.
export function indexesForPlanningTerm(indexes, term) {
  if (!term) return indexes || [];
  return (indexes || []).filter(index => index.academic_year === term.academic_year &&
    Number(index.semester) === Number(term.semester));
}
