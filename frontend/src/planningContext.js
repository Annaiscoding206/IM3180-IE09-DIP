// One generation token covers the entire refresh, including errors. Invalidating
// on a switch/mutation prevents an older plan's response from being committed.
export function createPlanningContextLoader(api) {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async load(studentId, planId, onData, onError) {
      const current = ++generation;
      try {
        const [courses, curriculum] = await Promise.all([
          api.courses(planId),
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
        if (current === generation) onData({ courses: annotated, curriculum });
      } catch (error) {
        if (current === generation) onError(error);
      }
    },
  };
}
