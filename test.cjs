// Local simulated checks. These do not establish live Supabase persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(__dirname+'/index.html','utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
new vm.Script(inline);
const elements = new Map();
function element(name) {
  if (!elements.has(name)) elements.set(name,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){}});
  return elements.get(name);
}
const storage = new Map();
const gradeRows = [
  {assignment_id:1,grade:'B',graded_at:'2026-10-12T18:00:00Z'},
  {assignment_id:2,grade:null,graded_at:null}
];
const context = vm.createContext({console,setTimeout,clearTimeout,Intl,Date,
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  window:{APP_CONFIG:{publishableKey:'',demoAssignmentIds:['1','2']}},
  document:{getElementById:element,addEventListener(){},querySelectorAll:()=>[]}});
const context = vm.createContext({console,setTimeout,clearTimeout,Intl,Date,window:{APP_CONFIG:{publishableKey:''}},document:{getElementById:element,addEventListener(){},querySelectorAll:()=>[]}});
vm.runInContext(fs.readFileSync(__dirname+'/priorities.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/backend.js','utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
vm.runInContext(inline,context);
const api = context.CanvasBackend;
const rows = [1,2].map(assignment_id=>({assignment_id,name:assignment_id===1?'<img src=x onerror=alert(1)>':'Another assignment',percentage_of_grade:10,completed:false,deleted:false,priority:99,due_date:'2026-10-11T05:59:00Z',est_time:'01:30:00'}));
const calls = [];
let failure = false,gradeFailure = false,wrongResponse = false,release=null;
const client = {from(table){if(table==='lists'||table==='list_assignments')return {select(){return this},order(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};assert.ok(table==='assignments'||table==='assignment_grades');let patch=null,filters=[];const query={
let failure = false,wrongResponse = false,release=null;
const client = {from(table){if(table==='lists'||table==='list_assignments'||table==='user_priorities')return {select(){return this},order(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};assert.equal(table,'assignments');let patch=null,filters=[];const query={
  select(){return query},in(key,values){filters.push(row=>values.includes(String(row[key])));return query},
  eq(key,value){filters.push(row=>String(row[key])===String(value));return query},
  order(){return query},update(value){patch=value;calls.push(value);return query},
  then(resolve,reject){return query.execute(false).then(resolve,reject)},
  single(){return query.execute(true)},
  async execute(single){if(release)await new Promise(resolve=>{release=resolve});if(failure||gradeFailure&&table==='assignment_grades')return {data:null,error:{message:'Network unavailable'}};const selected=(table==='assignment_grades'?gradeRows:rows).filter(row=>filters.every(filter=>filter(row)));if(patch){assert.equal(table,'assignments');assert.deepEqual(Object.keys(patch),['completed']);selected.forEach(row=>Object.assign(row,patch));}return {data:single?(wrongResponse?{assignment_id:999,completed:true}:selected[0]||null):selected,error:null}}
};return query}};
(async()=>{
  const backend=api.create(client,['1','2']);context.testBackend=backend;
  vm.runInContext("backend=testBackend;user={id:'demo'}",context);
  await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.A.length',context),2);
  assert.equal(vm.runInContext('S.A[0].d',context),'2026-10-10');
  assert.equal(vm.runInContext('S.A[0].t',context),90);
  assert.equal(vm.runInContext('S.A[0].p',context),3);
  assert.equal(vm.runInContext("dueComparison({dueAt:'2026-10-11T05:59:00Z'},'2026-10-11T05:59:00Z')",context),true);
  assert.equal(vm.runInContext("dueComparison({dueAt:'2026-10-11T05:59:00Z'},'2026-10-11T05:59:01Z')",context),false);
  assert.equal(vm.runInContext("S.demoGrades['1'].grade",context),'B');
  assert.equal(vm.runInContext("S.demoGrades['2']",context),undefined);
  gradeRows[1].grade='B+';gradeRows[1].graded_at='2026-10-15T18:00:00Z';
  await vm.runInContext('loadDemoGrades()',context);
  assert.equal(vm.runInContext("S.demoGrades['2'].grade",context),'B+');
  gradeFailure=true;await vm.runInContext('loadDemoGrades()',context);
  assert.equal(vm.runInContext('S.A.length',context),2);
  assert.equal(vm.runInContext('S.demoGradesLoaded',context),false);
  gradeFailure=false;await vm.runInContext('loadDemoGrades()',context);
  assert.equal(vm.runInContext("S.demoGrades['2'].grade",context),'B+');
  assert.ok(element('list').innerHTML.includes('&lt;img'));
  assert.ok(!element('list').innerHTML.includes('<img src=x'));
  release=true;const first=vm.runInContext("tog('1')",context);
  assert.equal(vm.runInContext("S.saving.has('1')",context),true);
  assert.equal(vm.runInContext('S.done[1]',context),false);
  assert.equal(element('reload-tasks').disabled,true);
  assert.equal(element('signout').disabled,true);
  await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.done[1]',context),false);
  await vm.runInContext("tog('1')",context);assert.equal(calls.length,1);
  const finish=release;release=null;finish();await first;
  assert.equal(vm.runInContext('S.done[1]',context),true);
  const recordedAt=vm.runInContext("S.finishTimes['1']",context);
  assert.ok(Number.isFinite(Date.parse(recordedAt)));
  assert.equal(JSON.parse(storage.get('canvas-todo-finish-times-v1:demo'))['1'],recordedAt);
  vm.runInContext('S.tab=1;home()',context);
  assert.ok(element('list').innerHTML.includes('After due date'));
  vm.runInContext('S.tab=0;home()',context);
  assert.ok(!element('list').innerHTML.includes('data-assignment-id="1"'));
  assert.equal(rows[0].completed,true);assert.equal(rows[1].completed,false);
  vm.runInContext('S.A=[];S.done={}',context);await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.done[1]',context),true);
  assert.equal(vm.runInContext("S.finishTimes['1']",context),recordedAt);
  await vm.runInContext("tog('1')",context);assert.equal(rows[0].completed,false);
  assert.equal(vm.runInContext("S.finishTimes['1']",context),undefined);
  failure=true;await vm.runInContext("tog('1')",context);
  assert.equal(vm.runInContext('S.done[1]',context),false);
  assert.equal(element('sync-error').hidden,false);
  assert.equal(vm.runInContext('S.saving.size',context),0);
  assert.equal(element('reload-tasks').disabled,false);
  assert.equal(element('signout').disabled,false);
  // A second client saved after this page loaded: the prior-value filter matches no row.
  failure=false;rows[0].completed=true;await vm.runInContext("tog('1')",context);
  assert.equal(vm.runInContext('S.done[1]',context),false);
  assert.equal(rows[0].completed,true);
  assert.equal(element('sync-error').hidden,false);
  await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.done[1]',context),true);
  await vm.runInContext("tog('1')",context);assert.equal(rows[0].completed,false);
  wrongResponse=true;await vm.runInContext("tog('1')",context);
  assert.equal(vm.runInContext('S.done[1]',context),false);
  assert.ok(element('sync-error').textContent.includes('did not confirm'));
  wrongResponse=false;await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.done[1]',context),true);
  failure=true;await vm.runInContext('loadTasks()',context);
  assert.equal(vm.runInContext('S.A.length',context),0);
  assert.equal(vm.runInContext('S.ready',context),false);
  assert.throws(()=>api.id(Number.MAX_SAFE_INTEGER+1));
  assert.throws(()=>api.id("1');alert(1)"));
  await assert.rejects(backend.save('3',false,true),/outside the demo/);
  console.log('PASS: simulated confirmed saves, reload, reversal, row isolation, failed load/save, stale-value rejection, control locks, repeated clicks, unconfirmed response, escaping, ID validation. See README for live verification status.');
})().catch(error=>{console.error(error);process.exitCode=1});
