const assert=require('node:assert/strict');
require('./priorities.js');require('./assignment-fields.js');require('./backend.js');

let patch=null;const filters=[];
const row={assignment_id:1,name:'Lab',description:'',class_name:'IS 401',due_date:'2026-11-20T06:59:59Z',est_time:'00:30:00',optional:false,percentage_of_grade:10,grade_earned_percent:null,priority:2,completed:true,completed_at:'2026-11-16T18:00:00Z',deleted:false,client_request_id:null};
const client={from(table){assert.equal(table,'assignments');const query={
 update(value){patch=value;return query},eq(key,value){filters.push([key,value]);return query},select(){return query},
 async single(){return {data:{...row,...patch},error:null}}
};return query}};

(async()=>{
 const backend=CanvasBackend.create(client,['1']);
 const saved=await backend.updateAssignmentGrade('1',92.5);
 assert.deepEqual(patch,{grade_earned_percent:92.5});assert.equal(saved.earnedGrade,92.5);
 assert.ok(filters.some(([key,value])=>key==='completed'&&value===true));
 await assert.rejects(()=>backend.updateAssignmentGrade('1',-1),/0 to 100/);
 await assert.rejects(()=>backend.updateAssignmentGrade('1',101),/0 to 100/);
 await assert.rejects(()=>backend.updateAssignmentGrade('999',90),/not available/);
 const html=require('node:fs').readFileSync('index.html','utf8');
 assert.match(html,/What grade did you get\?/);assert.match(html,/Not graded yet/);assert.match(html,/updateAssignmentGrade/);
 console.log('PASS: completed-assignment grade validation, confirmed Supabase save, and grade prompt controls.');
})().catch(error=>{console.error(error);process.exitCode=1});
