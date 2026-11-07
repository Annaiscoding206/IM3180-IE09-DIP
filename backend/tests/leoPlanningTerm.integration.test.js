const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto'),{once}=require('node:events');
const path=require('node:path');

test('website Leo follows Sem 1 / Sem 2 / Sem 1 while preserving ownership, term data and channel history', {skip:process.env.RUN_MYSQL_TESTS!=='1'}, async t=>{
  require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});process.env.OPENAI_AGENTS_DISABLE_TRACING='1';
  const pool=require('../src/config/db'),plans=require('../src/services/planService'),leo=require('../src/services/leoPlanningService');
  const {RunContext}=await import('@openai/agents');
  const {askSmartStars}=await import('../src/services/chatService.mjs');
  const conversation=await import('../src/services/conversationService.mjs');
  const tools=await import('../src/ai/tools/planningTools.mjs');
  const {getStudentTimetableTool}=await import('../src/ai/tools/timetableTools.mjs');
  const {interpretTimetablePreferencesTool}=await import('../src/ai/tools/preferenceTools.mjs');
  const prefix='LT'+randomBytes(3).toString('hex').toUpperCase(),student=prefix+'S',foreign=prefix+'F';const codes=[prefix+'A',prefix+'B'];let server;
  t.after(async()=>{if(server)await new Promise(r=>server.close(r));try{await pool.query('DELETE FROM student WHERE student_id IN (?,?)',[student,foreign]);await pool.query('DELETE FROM course_info WHERE course_code IN (?)',[codes]);}finally{await pool.end();}});
  for(const id of [student,foreign])await pool.query("INSERT INTO student(student_id,programme,study_year) VALUES (?,'TEST',2)",[id]);
  const contexts=[];
  for(const [i,code] of codes.entries()) {
    const request=await plans.resolveRequestTerm(student,{academic_year:'2026-2027',semester:i+1});
    const plan=await plans.createPlan(request.request_id,{plan_name:'AUTO fixture '+i});
    await pool.query("INSERT INTO course_info(course_code,index_no,course_name,au,grading_type,academic_year,semester) VALUES (?,?,'Leo term fixture',3,'LETTER_GRADED','2026-2027',?)",[code,101+i,i+1]);
    await pool.query('INSERT INTO plan_selected_course(plan_id,course_code) VALUES (?,?)',[plan.plan_id,code]);
    await pool.query("INSERT INTO planning_day_preference(request_id,day_of_week,preference_type,constraint_level) VALUES (?,?,'AVOID','SOFT')",[request.request_id,i===0?'MON':'FRI']);
    contexts.push({requestId:request.request_id,planId:plan.plan_id,semester:i+1,code,day:i===0?'MON':'FRI'});
  }
  const foreignRequest=await plans.resolveRequestTerm(foreign,{academic_year:'2026-2027',semester:1});
  const conversationId=(await conversation.createConversation({studentId:student,title:'Leo term switching'})).conversation_id;
  await conversation.saveMessage({studentId:student,conversationId,role:'user',content:'Old Telegram preference: avoid all Friday classes',sourceChannel:'telegram'});
  const invoke=async(tool,input,context)=>JSON.parse(await tool.invoke(new RunContext(context),JSON.stringify(input)));
  const draftInput={request_id:null,academic_year:null,semester:null,day_preferences:[{day_of_week:'MON',preference_type:'PREFER',constraint_level:'SOFT'}],time_preferences:[],objectives:[],clarification_questions:[]};
  const oldDraft=await invoke(interpretTimetablePreferencesTool,{...draftInput,request_id:contexts[0].requestId},{studentId:student,conversationId,message:'Prefer Monday classes'});
  const capture=async()=>{const result={};for(const table of ['planning_request','plan','plan_selected_course','planning_day_preference'])result[table]=(await pool.query('SELECT * FROM '+table))[0].map(JSON.stringify).sort();return result;};
  const before=await capture();
  for(const c of [contexts[0],contexts[1],contexts[0]]) {
    const result=await askSmartStars({studentId:student,conversationId,requestId:c.requestId,planId:c.planId,message:'Show my current planning context'}, {runAgent:async(agent,input,{context})=>{
      assert.equal(context.activeRequestId,c.requestId);assert.equal(context.activePlanId,c.planId);assert.equal(context.planningTerm.semester,c.semester);
      assert.ok(JSON.stringify(input).includes(`request_id=${c.requestId}`));
      const data=await invoke(tools.getPlanningContextTool,{request_id:null,plan_id:null},context);
      assert.equal(data.request.request_id,c.requestId);assert.deepEqual(data.selected_courses,[c.code]);assert.deepEqual(data.preferences.day_preferences.map(p=>p.day_of_week),[c.day]);
      const listed=await invoke(tools.listPlanningRequestsTool,{},context);assert.deepEqual(listed.map(r=>r.request_id),[c.requestId]);
      const other=contexts.find(x=>x.requestId!==c.requestId);
      const timetable=await invoke(getStudentTimetableTool,{request_id:null,plan_id:c.planId,plan_label:null,academic_year:null,semester:null},context);
      assert.equal(timetable.request_id,c.requestId);assert.equal(timetable.semester,c.semester);
      assert.equal((await invoke(tools.getPlanningContextTool,{request_id:other.requestId,plan_id:other.planId},context)).code,'ACTIVE_REQUEST_MISMATCH');
      assert.equal((await invoke(interpretTimetablePreferencesTool,{...draftInput,request_id:other.requestId},context)).code,'ACTIVE_REQUEST_MISMATCH');
      assert.equal((await invoke(interpretTimetablePreferencesTool,{...draftInput,semester:other.semester},context)).code,'ACTIVE_REQUEST_MISMATCH');
      assert.equal((await invoke(getStudentTimetableTool,{request_id:null,plan_id:other.planId,plan_label:null,academic_year:null,semester:null},context)).http_status,404);
      return {finalOutput:'Verified active semester '+c.semester};
    }});
    assert.equal(result.planning_context.request_id,c.requestId);
  }
  const c=contexts[1];
  const stale=await askSmartStars({studentId:student,conversationId,requestId:c.requestId,planId:c.planId,message:oldDraft.confirmation_command},{runAgent:()=>{throw Error('Must reject deterministically');}});
  assert.equal(stale.planning_result.code,'ACTIVE_REQUEST_MISMATCH');
  const natural=await askSmartStars({studentId:student,conversationId,requestId:c.requestId,planId:c.planId,message:'save my preferences'},{runAgent:()=>{throw Error('Must not use old draft');}});
  assert.match(natural.reply,/couldn't find/);
  const staged=await askSmartStars({studentId:student,conversationId,requestId:c.requestId,planId:c.planId,message:'Prefer Monday classes softly'},{runAgent:async(agent,input,{context})=>{
    assert.ok(!JSON.stringify(input).includes('Old Telegram preference'));
    assert.ok(!JSON.stringify(input).includes(oldDraft.draft_id));
    const draft=await invoke(interpretTimetablePreferencesTool,draftInput,context);assert.equal(draft.request_id,c.requestId);
    return {finalOutput:'draft'};
  }});
  assert.equal(staged.preference_draft.request_id,c.requestId);
  assert.deepEqual(await capture(),before);
  // Telegram without browser context retains its own request-resolution behavior.
  await askSmartStars({studentId:student,conversationId,sourceChannel:'telegram',message:'Show my planning requests'},{runAgent:async(agent,input,{context})=>{
    assert.equal(context.activeRequestId,undefined);assert.equal((await invoke(tools.listPlanningRequestsTool,{},context)).length,2);
    assert.ok(JSON.stringify(input).includes('Message sent via Website'));return {finalOutput:'Telegram context unchanged'};
  }});
  const messages=await conversation.getConversationMessages({studentId:student,conversationId});
  assert.ok(messages.some(m=>m.source_channel==='website'));assert.ok(messages.some(m=>m.source_channel==='telegram'&&m.content.includes('Old Telegram preference')));
  const app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{res.locals.authenticatedStudentId=student;next()});app.use('/api/chat',require('../src/routes/chatRoutes'));
  server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const post=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'What was my latest Telegram message?',conversationId,...body})});return {status:r.status,body:await r.json()};};
  assert.equal((await post({request_id:foreignRequest.request_id})).status,404);
  assert.equal((await post({request_id:contexts[0].requestId,plan_id:contexts[1].planId})).status,404);
  assert.equal((await post({request_id:'invalid'})).status,400);
  const valid=await post({request_id:contexts[0].requestId,plan_id:contexts[0].planId});assert.equal(valid.status,200);assert.equal(valid.body.planning_context.semester,1);
});
