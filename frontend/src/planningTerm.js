// A suggestion only, evaluated at bootstrap when no saved request exists.
// Singapore dates: Jun–Nov suggests Sem 1; Dec–May suggests Sem 2.
// Jun/Jul and Dec intentionally suggest the upcoming teaching semester.
export function suggestedPlanningTerm(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value);
  const start = month <= 5 ? year - 1 : year;
  return { academic_year: `${start}-${start + 1}`, semester: month >= 6 && month <= 11 ? 1 : 2 };
}

export function preferredPlanningRequest(requests, rememberedId) {
  const remembered = requests.find(r => String(r.request_id) === String(rememberedId));
  return remembered || [...requests].sort((a, b) =>
    (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0) ||
    Number(b.request_id) - Number(a.request_id))[0] || null;
}

export function planningYears(courses, requests, term) {
  const years = new Set([term.academic_year]);
  for (const row of [...courses, ...requests]) {
    if (row.academic_year) years.add(row.academic_year);
    for (const offering of row.available_semesters || []) years.add(offering.academic_year);
  }
  // Offer adjacent years even when the catalogue currently contains only one.
  const starts = [...years].map(year => Number(year.slice(0, 4))).filter(Number.isInteger);
  for (const start of starts) for (const offset of [-1, 1]) years.add(`${start + offset}-${start + offset + 1}`);
  return [...years].sort();
}
