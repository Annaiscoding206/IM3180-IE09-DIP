const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const path = require('node:path');

test('term resolver reuses owned requests atomically and preserves independent term state', {skip:process.env.RUN_MYSQL_TESTS!=='1'}, async t => {
  require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
  const pool=require('../src/config/db');
  const service=require('../src/services/planService');
  const prefix='TM'+randomBytes(3).toString('hex').toUpperCase();
  const student=prefix+'S',foreign=prefix+'F',code=prefix+'C';let server;
  t.after(async()=>{if(server)await new Promise(r=>server.close(r));try{await pool.query('DELETE FROM student WHERE student_id IN (?,?)',[student,foreign]);await pool.query('DELETE FROM course_info WHERE course_code=?',[code]);}finally{await pool.end();}});
  for(const id of [student,foreign])await pool.query("INSERT INTO student (student_id,programme,study_year) VALUES (?, 'TEST',2)",[id]);
  const app=require('express')();app.use(require('express').json());let identity=student;
  app.use((req,res,next)=>{res.locals.authenticatedStudentId=identity;next()});
  app.use('/api/planning-requests',require('../src/routes/planningRequestRoutes'));
  app.use('/api/plans',require('../src/routes/planRoutes'));
  app.use('/api/courses',require('../src/routes/courseRoutes'));
  server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const http=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
  const resolve=term=>http('/planning-requests/resolve-term','POST',term);
  const terms=[{academic_year:'2026-2027',semester:1},{academic_year:'2026-2027',semester:2},{academic_year:'2027-2028',semester:1}];
  const contexts=[];
  for(const [i,term] of terms.entries()) {
    const responses=await Promise.all([resolve(term),resolve(term),resolve(term)]);
    assert.ok(responses.every(r=>r.status===200));assert.equal(new Set(responses.map(r=>r.data.request_id)).size,1);
    const request=responses[0].data, index=101+i;
    await pool.query(`INSERT INTO course_info (course_code,index_no,course_name,au,grading_type,academic_year,semester) VALUES (?,?,'Term fixture',3,'LETTER_GRADED',?,?)`,[code,index,term.academic_year,term.semester]);
    await pool.query("INSERT INTO class_slots (course_code,index_no,class_type,day_of_week,start_time,end_time,teaching_weeks) VALUES (?,?,'LECTURE','MON','09:00','10:00','1-13')",[code,index]);
    const plan=await service.createPlan(request.request_id,{plan_name:'Plan 1'});
    assert.equal((await http(`/plans/${plan.plan_id}/selected-courses`,'POST',{course_code:code})).status,201);
    assert.equal((await http(`/plans/${plan.plan_id}/indexes/${code}`,'PUT',{index_no:index})).status,201);
    await pool.query('UPDATE plan_course SET locked=1 WHERE plan_id=?',[plan.plan_id]);
    await pool.query('UPDATE planning_request SET target_au=? WHERE request_id=?',[15+i,request.request_id]);
    await pool.query("INSERT INTO planning_day_preference (request_id,day_of_week,preference_type,constraint_level) VALUES (?,'FRI','AVOID','SOFT')",[request.request_id]);
    await pool.query("INSERT INTO plan_blocked_period (plan_id,day_of_week,start_time,end_time) VALUES (?,'WED','12:00','13:00')",[plan.plan_id]);
    contexts.push({request,plan,index,term});
  }
  assert.equal(new Set(contexts.map(c=>c.request.request_id)).size,3);
  const tables=['planning_request','planning_request_course','plan','plan_course','plan_selected_course','planning_day_preference','plan_blocked_period'];
  const capture=async()=>{const result={};for(const table of tables)result[table]=(await pool.query('SELECT * FROM '+table))[0].map(JSON.stringify).sort();return result;};
  const before=await capture();
  for(const c of [contexts[1],contexts[2],contexts[0],contexts[1],contexts[0]]) {
    const r=await resolve(c.term);assert.equal(r.data.request_id,c.request.request_id);
    const detail=await http(`/courses/${code}?planning_request_id=${r.data.request_id}`);
    assert.deepEqual(detail.data.indexes.map(i=>i.index_no),[c.index]);
    const wrong=contexts.find(other=>other.index!==c.index);
    assert.equal((await http(`/plans/${c.plan.plan_id}/indexes/${code}`,'PUT',{index_no:wrong.index})).status,422);
  }
  assert.deepEqual(await capture(),before);
  identity=foreign;const other=await resolve(terms[0]);assert.notEqual(other.data.request_id,contexts[0].request.request_id);
  assert.equal((await http(`/planning-requests/${contexts[0].request.request_id}`)).status,404);
  assert.equal((await resolve({...terms[0],student_id:student})).status,400);
  for(const term of [{academic_year:'2026-2028',semester:1},{academic_year:'bad',semester:1},{academic_year:'2026-2027',semester:0}])assert.equal((await resolve(term)).status,400);
});
