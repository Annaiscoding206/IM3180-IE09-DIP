import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedPlanningTerm, preferredPlanningRequest, planningYears } from '../src/planningTerm.js';

test('Singapore term suggestion handles upcoming semesters and academic year boundaries', () => {
  for (const [date,year,semester] of [['2026-01-15',2025,2],['2026-05-31',2025,2],['2026-06-01',2026,1],['2026-11-05',2026,1],['2026-12-01',2026,2],['2027-01-01',2026,2]]) {
    assert.deepEqual(suggestedPlanningTerm(new Date(date+'T04:00:00Z')), {academic_year:`${year}-${year+1}`,semester});
  }
  assert.deepEqual(suggestedPlanningTerm(new Date('2026-11-30T16:00:00Z')), {academic_year:'2026-2027',semester:2});
});
test('saved request wins over dates; otherwise use most recently updated existing request, even a future year', () => {
  const requests=[{request_id:1,academic_year:'2024-2025',semester:2,updated_at:'2026-11-04'}, {request_id:2,academic_year:'2027-2028',semester:1,updated_at:'2026-11-05'}];
  assert.equal(preferredPlanningRequest(requests,null).request_id,2);
  assert.equal(preferredPlanningRequest(requests,'1').request_id,1);
  assert.equal(preferredPlanningRequest(requests,'foreign').request_id,2);
  assert.equal(preferredPlanningRequest([],null),null);
  assert.equal(preferredPlanningRequest([{request_id:1},{request_id:2}],null).request_id,2);
});
test('year choices include catalogue offerings, requests and adjacent future years', () => {
  const years=planningYears([{academic_year:'2026-2027',available_semesters:[{academic_year:'2028-2029'}]}],[{academic_year:'2024-2025'}],{academic_year:'2026-2027'});
  for (const year of ['2024-2025','2026-2027','2027-2028','2028-2029']) assert.ok(years.includes(year));
});
