import test, { before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';
import { suggestedPlanningTerm } from '../src/planningTerm.js';
let loadApp,dom,root;
before(async()=>{loadApp=await compileModule('main.jsx');});
beforeEach(()=>{dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173'});dom.window.HTMLElement.prototype.scrollIntoView=()=>{};Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;dom.window.close();});
const flush=async()=>{for(let i=0;i<25;i++)await act(async()=>{await new Promise(r=>setImmediate(r));});};
const mount=async()=>{await act(async()=>{root=(await loadApp()).appRoot;});await flush();};
const select=async(label,value)=>{const el=document.querySelector(`[aria-label="${label}"]`);assert.ok(el);assert.equal(el.disabled,false);await act(async()=>{el.value=String(value);el.dispatchEvent(new window.Event('change',{bubbles:true}));});await flush();};
const click=async(button)=>{assert.ok(button);await act(async()=>button.click());await flush();};
const nav=name=>[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes(name));

function fixture(t,{empty=false}={}) {
  const requests=empty?[]:[{request_id:11,academic_year:'2026-2027',semester:1,updated_at:'2026-11-05',target_au:15},{request_id:12,academic_year:'2026-2027',semester:2,updated_at:'2026-11-04',target_au:18}];
  const calls=[],created=[],unexpected=[],chatPosts=[];let fail=false,delay=null,release;
  const selected={11:['IE1005'],12:['IE0005']};
  const byPlan=id=>requests.find(r=>Math.floor(id/10)===r.request_id);
  const courses=[{course_code:'IE1005',course_name:'Programming',au:3,course_types:['CORE'],academic_year:'2026-2027',semester:1},{course_code:'IE0005',course_name:'Data Science',au:3,course_types:['CORE'],academic_year:'2026-2027',semester:2}];
  const respond=data=>Response.json({success:true,data});
  t.mock.method(globalThis,'fetch',async(path,options={})=>{
    calls.push(path);const u=new URL(path,'http://localhost');const p=u.pathname;
    if(p==='/api/chat/active')return respond([]);
    if(p==='/api/chat'){chatPosts.push(JSON.parse(options.body));return Response.json({success:true,reply:'Verified request '+chatPosts.at(-1).request_id});}
    if(p==='/api/students/current')return respond({student_id:'DEMO002'});
    if(p==='/api/students/DEMO002')return respond({student_id:'DEMO002',student_name:'Demo EEE Student',programme:'EEE',study_year:2,completed_courses:[]});
    if(p==='/api/planning-requests/resolve-term') {
      if(fail){fail=false;return Response.json({success:false,message:'Term unavailable'},{status:503});}
      const term=JSON.parse(options.body);assert.deepEqual(Object.keys(term).sort(),['academic_year','semester']);
      let r=requests.find(r=>r.academic_year===term.academic_year&&r.semester===term.semester);
      if(!r){r={request_id:requests.length?Math.max(...requests.map(r=>r.request_id))+1:11,...term,target_au:null};requests.push(r);created.push(r);selected[r.request_id]=[];}
      return respond(r);
    }
    if(p==='/api/planning-requests')return respond(requests);
    if(/^\/api\/planning-requests\/\d+$/.test(p))return respond(requests.find(r=>r.request_id===Number(p.split('/')[3])));
    if(p.endsWith('/plans')&&p.startsWith('/api/planning-requests/')){const id=Number(p.split('/')[3]);return respond([0,1,2].map(n=>({plan_id:id*10+n,request_id:id,plan_name:'Plan '+(n+1),status:'GENERATED'})));}
    if(p.endsWith('/active-plan'))return respond({plan:null});
    if(p.endsWith('/preferences'))return respond({day_preferences:[],time_preferences:[],objectives:[]});
    if(p.startsWith('/api/plans/')) {
      const id=Number(p.split('/')[3]),r=byPlan(id),codes=selected[r?.request_id]||[];
      if(p.endsWith('/selected-courses'))return respond(codes.map(course_code=>({course_code})));
      if(p.endsWith('/indexes'))return respond(codes.map(course_code=>({course_code,index_no:r.semester===1?32301:34040,locked:true})));
      if(p.endsWith('/blocked-periods'))return respond({blocked_periods:[]});
      if(p.endsWith('/timetable'))return respond([]);
      if(p.endsWith('/summary'))return respond({});
    }
    if(p==='/api/courses') {
      const r=u.searchParams.has('plan_id')?byPlan(Number(u.searchParams.get('plan_id'))):requests.find(r=>r.request_id===Number(u.searchParams.get('planning_request_id')));
      const data=courses.map(c=>({...c,available_semesters:[{academic_year:c.academic_year,semester:c.semester}],planning_term:r?{academic_year:r.academic_year,semester:r.semester}:null,available_for_planning_term:r?c.academic_year===r.academic_year&&c.semester===r.semester:null}));
      if(delay&&r?.request_id===delay){delay=null;return new Promise(resolve=>{release=()=>resolve(respond(data));});}
      return respond(data);
    }
    if(p.includes('/eligibility/'))return Response.json({success:true,eligible:true,can_select:true});
    if(p.includes('/curriculum'))return respond({curriculum:{title:'EEE Curriculum'},categories:[],courses:[]});
    if(p.endsWith('/degree-audit'))return respond({records:[],summary:{passed_course_count:12,earned_au:28,earned_au_complete:true}});
    if(p.startsWith('/api/courses/')&&p.endsWith('/timetable'))return respond([]);
    if(p.startsWith('/api/courses/'))return respond({...courses.find(c=>c.course_code===p.split('/')[3]),indexes:[{index_no:32361,academic_year:'2026-2027',semester:1},{index_no:34040,academic_year:'2026-2027',semester:2}]});
    unexpected.push(path);return Response.json({success:false,message:'Unexpected fixture route'},{status:500});
  });
  return {requests,created,calls,unexpected,chatPosts,fail:()=>{fail=true;},delay:id=>{delay=id;},release:()=>release?.()};
}

test('manual semester/year switching restores saved contexts and Explorer availability without leaking old data',async t=>{
  const f=fixture(t);await mount();
  assert.equal(document.querySelector('[aria-label="Planning semester"]').value,'1');
  assert.equal(f.created.length,0);
  assert.ok(f.calls.includes('/api/courses?plan_id=110'));
  await select('Planning semester',2);
  assert.ok(f.calls.includes('/api/courses?plan_id=120'));
  assert.equal(document.querySelector('[aria-label="Planning semester"]').value,'2');
  const cards=()=>[...document.querySelectorAll('.course-card')];
  assert.match(cards().find(c=>c.textContent.includes('IE1005')).textContent,/Not offered in Semester 2/);
  assert.ok(document.querySelector('.sidebar nav b').textContent==='1');
  await click(nav('My planner'));
  assert.ok(document.querySelector('.planner-selected-grid').textContent.includes('IE0005'));
  assert.ok(!document.querySelector('.planner-selected-grid').textContent.includes('IE1005'));
  await select('Planning semester',1);
  assert.ok(document.querySelector('.planner-selected-grid').textContent.includes('IE1005'));
  assert.ok(!document.querySelector('.planner-selected-grid').textContent.includes('IE0005'));
  await select('Planning academic year','2027-2028');
  assert.equal(f.created.length,1);assert.deepEqual([f.created[0].academic_year,f.created[0].semester],['2027-2028',1]);
  assert.equal(document.querySelectorAll('.planner-selected-card').length,0);
  await select('Planning academic year','2026-2027');
  assert.ok(document.querySelector('.planner-selected-grid').textContent.includes('IE1005'));
  assert.equal(f.created.length,1);
  assert.equal(sessionStorage.getItem('smart-stars-request:DEMO002'),'11');
  assert.deepEqual(f.unexpected,[]);
});

test('new student gets suggested default once and can immediately override it',async t=>{
  const f=fixture(t,{empty:true});await mount();const term=suggestedPlanningTerm();
  assert.equal(f.created.length,1);assert.equal(f.created[0].academic_year,term.academic_year);assert.equal(f.created[0].semester,term.semester);
  await select('Planning semester',term.semester===1?2:1);
  assert.equal(f.created.length,2);
  assert.notEqual(f.created[0].request_id,f.created[1].request_id);
  assert.deepEqual(f.unexpected,[]);
});

test('remembered request outranks the latest request; failed term switch keeps the old context',async t=>{
  const f=fixture(t);sessionStorage.setItem('smart-stars-request:DEMO002','12');await mount();
  assert.equal(document.querySelector('[aria-label="Planning semester"]').value,'2');
  f.fail();await select('Planning semester',1);
  assert.equal(document.querySelector('[aria-label="Planning semester"]').value,'2');
  assert.match(document.querySelector('[role="alert"]').textContent,/Term unavailable/);
  assert.equal(f.created.length,0);assert.deepEqual(f.unexpected,[]);
});

test('late Explorer response from another term cannot replace current term availability',async t=>{
  const f=fixture(t);await mount();f.delay(12);await select('Planning semester',2);
  await select('Planning semester',1);await act(async()=>f.release());await flush();
  const card=[...document.querySelectorAll('.course-card')].find(c=>c.textContent.includes('IE0005'));
  assert.match(card.textContent,/Not offered in Semester 1/);
  assert.equal(document.querySelector('[aria-label="Planning semester"]').value,'1');
  assert.deepEqual(f.unexpected,[]);
});


test('website Leo sends the restored request and working plan on Sem 1 / Sem 2 / Sem 1',async t=>{
  const f=fixture(t);await mount();await click(document.querySelector('[aria-label="Open Leo Assistant"]'));
  const send=async()=>{
    const input=document.querySelector('[aria-label="Message to Leo Assistant"]');
    await act(async()=>{
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Show my planning context');
      input.dispatchEvent(new window.Event('input',{bubbles:true}));
      input.dispatchEvent(new window.Event('change',{bubbles:true}));
    });
    await click(document.querySelector('[aria-label="Send message"]'));
  };
  await send();await select('Planning semester',2);await send();await select('Planning semester',1);await send();
  assert.deepEqual(f.chatPosts.map(({request_id,plan_id})=>[request_id,plan_id]),[[11,110],[12,120],[11,110]]);
  assert.ok(f.chatPosts.every(post=>!('student_id' in post)));
  assert.deepEqual(f.unexpected,[]);
});
