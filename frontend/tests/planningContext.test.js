import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanningContextLoader } from '../src/planningContext.js';
import { api } from '../src/api.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
test('API helpers send plan_id consistently and omit it for academic-only reads', async t => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async path => { paths.push(path); return Response.json({ success: true, data: [] }); });
  await api.courses(4); await api.course('IE1005',4); await api.curriculum('S',4); await api.eligibility('S','IE1005',4); await api.curriculum('S');
  await api.courses(null, 8); await api.course('IE1005', null, 8);
  assert.deepEqual(paths, ['/api/courses?plan_id=4','/api/courses/IE1005?plan_id=4','/api/students/S/curriculum?plan_id=4','/api/students/S/eligibility/IE1005?plan_id=4','/api/students/S/curriculum','/api/courses?planning_request_id=8','/api/courses/IE1005?planning_request_id=8']);
});
test('switching plan refreshes status/eligibility; slower old results cannot overwrite it', async () => {
  const old = deferred(), results = [], errors = [], calls = [];
  const loader = createPlanningContextLoader({
    courses: async plan => { calls.push(plan); return plan === 1 ? old.promise : [{ course_code:'X', available_for_planning_term: false, planning_term: {semester:2} }]; },
    curriculum: async (_, plan) => ({ courses:[{ course_code:'X', status:plan === 1 ? 'PLANNED':'NOT_YET_TAKEN', eligibility:{ eligible:plan === 1 } }] }),
  });
  const pending = loader.load('S',1,x=>results.push(x),e=>errors.push(e));
  await loader.load('S',2,x=>results.push(x),e=>errors.push(e));
  old.resolve([{ course_code:'X', available_for_planning_term: true, planning_term: {semester:1} }]); await pending;
  assert.deepEqual(calls,[1,2]); assert.equal(results.length,1); assert.equal(errors.length,0);
  assert.equal(results[0].courses[0].curriculum_status,'NOT_YET_TAKEN'); assert.equal(results[0].courses[0].eligibility.eligible,false);
  assert.equal(results[0].courses[0].available_for_planning_term, false);
  assert.equal(results[0].courses[0].planning_term.semester, 2);
});
test('selection mutation invalidates same-plan pending responses and old errors', async () => {
  const old = deferred(), results=[], errors=[];
  let selected = false;
  const loader = createPlanningContextLoader({ courses: () => old.promise, curriculum: async () => ({ courses:[] }) });
  const pending=loader.load('S',1,x=>results.push(x),e=>errors.push(e));
  loader.invalidate(); old.reject(Error('stale error')); await pending;
  assert.deepEqual(errors,[]); assert.deepEqual(results,[]);
  const current = createPlanningContextLoader({
    courses: async () => [{course_code:'X'}],
    curriculum: async () => ({courses:[{course_code:'X',status:selected?'PLANNED':'NOT_YET_TAKEN',eligibility:{eligible:true}}]}),
  });
  for (const value of [true,false]) { selected=value; current.invalidate(); await current.load('S',1,x=>results.push(x),e=>errors.push(e)); }
  assert.deepEqual(results.map(r=>r.courses[0].curriculum_status),['PLANNED','NOT_YET_TAKEN']);
});
test('no curriculum still loads eligibility; current failures reach the caller', async () => {
  const results=[], errors=[], calls=[];
  const loader=createPlanningContextLoader({courses:async()=>[{course_code:'X'}],curriculum:async()=>{throw {details:{code:'NO_CURRICULUM'}}},eligibility:async(_,code,plan)=>{calls.push([code,plan]);return {eligible:true}}});
  await loader.load('S',3,x=>results.push(x),e=>errors.push(e));
  assert.deepEqual(calls,[['X',3]]); assert.equal(results[0].curriculum,null);
  const failed=createPlanningContextLoader({courses:async()=>{throw Error('offline')},curriculum:async()=>null});
  await failed.load('S',3,()=>{},e=>errors.push(e)); assert.equal(errors[0].message,'offline');
});
