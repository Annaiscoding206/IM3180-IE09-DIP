const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(query) {
  const sandbox = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name === '../services/planningError') return require('../src/services/planningError');
    if (name === '../services/curriculumService') return require('../src/services/curriculumService');
    if (name === '../services/planContextService') return require('../src/services/planContextService');
    assert.equal(name, '../config/db'); return { query };
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/courseController.js'), 'utf8'), sandbox);
  return async (name, params = {}, query = {}) => {
    const result = { status: 200 };
    await sandbox.module.exports[name]({params, query}, {
      status(value) { result.status = value; return this; },
      json(value) { result.body = JSON.parse(JSON.stringify(value)); return this; }
    });
    return result;
  };
}
test('invalid filters fail before querying the database', async () => {
  const call = setup(() => { throw Error('Must not query'); });
  for (const query of [{semester:'4'}, {semester:['1','2']}, {au:'abc'}, {au:'0'}, {search:{}}, {academic_year:''}]) {
    assert.equal((await call('getCourses', {}, query)).status, 400);
  }
});
test('search and filters use bound values and preserve response envelope', async () => {
  const call = setup(async (sql, params) => {
    if (/WHERE course_code IN/.test(sql)) return [[{course_code:'IE3014',academic_year:'2026-2027',semester:1}]];
    assert.match(sql, /course_code LIKE \?/);
    assert.deepEqual(Array.from(params), ["%O'Reilly%", "%O'Reilly%", '3', '1', '2026-2027']);
    return [[{course_code:'IE3014', au:3}]];
  });
  const r = await call('getCourses', {}, {search:"O'Reilly", au:'3', semester:'1', academic_year:'2026-2027'});
  assert.equal(r.status,200); assert.equal(r.body.count,1); assert.equal(r.body.data[0].course_code,'IE3014');
});
test('empty search results remain a successful empty list', async () => {
  const r = await setup(async () => [[]])('getCourses');
  assert.deepEqual(r.body,{success:true,count:0,data:[]});
});
test('anonymous catalogue callers cannot supply planning context', async () => {
  const call = setup(async () => [[{course_code:'IE3014',au:3}]]);
  for (const query of [{plan_id:'1'},{planning_request_id:'1'}]) {
    assert.equal((await call('getCourses',{},query)).status,401);
  }
});
test('detail and index lookup normalize course code and preserve existing fields', async () => {
  for (const handler of ['getCourseByCode','getCourseIndexes']) {
    const call = setup(async (sql, params) => {
      if (/WHERE course_code IN/.test(sql)) return [[{course_code:'IE3014',academic_year:'2026-2027',semester:1}]];
      assert.equal(params[0],'IE3014');
      return [/vacancy/.test(sql) ? [{index_no:12345,vacancy:5,vacancy_updated_at:null}] : [{course_code:'IE3014',au:3}]];
    });
    const r = await call(handler,{courseCode:' ie3014 '});
    assert.equal(r.status,200);
    assert.equal((handler === 'getCourseByCode' ? r.body.data.indexes : r.body.data)[0].vacancy,5);
  }
});
test('unknown course returns 404 for detail and indexes', async () => {
  const call = setup(async () => [[]]);
  for (const handler of ['getCourseByCode','getCourseIndexes']) assert.equal((await call(handler,{courseCode:'UNKNOWN'})).status,404);
});
test('invalid course or index is a 400', async () => {
  const call = setup(() => { throw Error('Must not query'); });
  for (const params of [{courseCode:'IE3014',indexNo:'bad'}, {courseCode:'IE3014',indexNo:'-1'}, {courseCode:'IE3014',indexNo:'2147483648'}, {courseCode:'!',indexNo:'1'}]) {
    assert.equal((await call('getIndexTimetable',params)).status,400);
  }
});
test('nonexistent course/index is 404 and never queries slots', async () => {
  const call = setup(async sql => { assert.doesNotMatch(sql,/class_slots/); return [[]]; });
  assert.equal((await call('getIndexTimetable',{courseCode:'IE3014',indexNo:'999'})).status,404);
});
test('existing index with no slots is explicitly unavailable', async () => {
  const call = setup(async sql => [/class_slots/.test(sql) ? [] : [{course_code:'IE3014',index_no:12345}]]);
  const r = await call('getIndexTimetable',{courseCode:'IE3014',indexNo:'12345'});
  assert.equal(r.status,200); assert.equal(r.body.timetable_available,false); assert.deepEqual(r.body.data,[]);
});
test('timetable retains teaching weeks and identity and requests calendar ordering', async () => {
  const slot = {slot_id:1,course_code:'IE3014',index_no:12345,class_type:'LECTURE',class_group:'G1',day_of_week:'MON',start_time:'09:00:00',end_time:'10:00:00',venue:'LT1',teaching_weeks:'1-13'};
  const call = setup(async (sql, params) => {
    assert.deepEqual(Array.from(params),['IE3014',12345]);
    if (/class_slots/.test(sql)) {
      assert.match(sql,/FIELD\(day_of_week, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'\), start_time, slot_id/);
      return [[slot]];
    }
    return [[{course_code:'IE3014',index_no:12345}]];
  });
  const r = await call('getIndexTimetable',{courseCode:'ie3014',indexNo:'12345'});
  assert.equal(r.body.timetable_available,true); assert.equal(r.body.index_no,'12345'); assert.deepEqual(r.body.data,[slot]);
});
test('database failures return a generic 500 response', async () => {
  const call = setup(async () => { throw Error('private DB detail'); });
  for (const handler of ['getCourses','getCourseByCode','getCourseIndexes','getIndexTimetable']) {
    const r = await call(handler,{courseCode:'IE3014',indexNo:'12345'});
    assert.equal(r.status,500); assert.equal(JSON.stringify(r.body).includes('private'),false);
  }
});
