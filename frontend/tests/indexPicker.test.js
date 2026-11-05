import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { compileModule } from './renderModule.js';

test('Planner filters index choices by term and drops a late response after a context switch', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost:5173' });
  Object.assign(globalThis,{window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const root = createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();});
  const Planner = (await (await compileModule('Planner.jsx'))()).default;
  const calls=[];let delayed=null, delay=false;
  const indexes=[32361,32362,32363,32364,34040].map(index_no=>({index_no,academic_year:'2026-2027',semester:index_no===34040?2:1,vacancy:null}));
  indexes.push({index_no:99999,academic_year:'2025-2026',semester:1});
  t.mock.method(globalThis,'fetch',async path=>{
    calls.push(path);const url=new URL(path,'http://localhost');let data=[];
    if(url.pathname==='/api/courses/IE0005') {
      if(delay){delay=false;return new Promise(resolve=>{delayed=()=>resolve(Response.json({success:true,data:{course_code:'IE0005',indexes}}));});}
      data={course_code:'IE0005',indexes};
    } else if(url.pathname.endsWith('/timetable')&&url.pathname.startsWith('/api/courses')) data=[{slot_id:1,day_of_week:'MON',start_time:'09:00:00',end_time:'10:00:00',teaching_weeks:'1-13'}];
    else if(url.pathname.match(/^\/api\/planning-requests\/\d+\/plans$/)) data=[1,2,3].map(n=>({plan_id:n,plan_name:'Plan '+n,status:'GENERATED'}));
    else if(url.pathname.endsWith('/active-plan')) data={plan:null};
    else if(url.pathname.endsWith('/summary')) data={};
    else if(url.pathname.endsWith('/preferences')) data={day_preferences:[],time_preferences:[],objectives:[]};
    else if(url.pathname.endsWith('/selected-courses')) data=[{course_code:'IE0005'}];
    else if(url.pathname.endsWith('/blocked-periods')) data={blocked_periods:[]};
    return Response.json({success:true,data});
  });
  const flush=async()=>{for(let i=0;i<15;i++)await act(async()=>{await new Promise(r=>setImmediate(r));});};
  const render=async(semester,year='2026-2027')=>{await act(async()=>root.render(React.createElement(Planner,{student:{student_id:'DEMO002'},planningRequest:{request_id:10,academic_year:year,semester,target_au:18},selectedCodes:['IE0005'],courses:[{course_code:'IE0005',course_name:'Intro to AI',au:3,academic_year:year,semester}],preferredPlanId:1})));await flush();};
  const open=async()=>{const b=[...document.querySelectorAll('button')].find(b=>/Choose index|Show indexes|Change index/.test(b.textContent));assert.ok(b,document.body.textContent);await act(async()=>b.click());await flush();};
  const shown=()=>[...document.querySelectorAll('.planner-index-row strong')].map(e=>e.textContent.trim());
  await render(1);await open();assert.deepEqual(shown(),[32361,32362,32363,32364].map(n=>'Index '+n));
  assert.ok(calls.includes('/api/courses/IE0005?plan_id=1'));
  assert.ok(!calls.some(p=>/indexes\/(34040|99999)\//.test(p)));
  await render(2);await open();assert.deepEqual(shown(),['Index 34040']);
  await render(1);delay=true;await open();assert.ok(delayed);
  await render(2);await open();assert.deepEqual(shown(),['Index 34040']);
  await act(async()=>delayed());await flush();assert.deepEqual(shown(),['Index 34040']);
  await render(1,'2027-2028');await open();assert.deepEqual(shown(),[]);assert.ok(document.body.textContent.includes('No indexes available for Semester 1'));
});
