// Creation and explicit import keep database and device-only assignments distinct.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:'',checked:false,innerHTML:'',textContent:'',hidden:false,disabled:false,
    classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){}});
  return elements.get(id);
}
const storage = new Map();
let nextRequest = 1;
const context = vm.createContext({console,Date,Intl,setTimeout:()=>0,clearTimeout(){},window:{APP_CONFIG:{}},
  crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(nextRequest++).padStart(12,'0')}`},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}}});
for (const name of ['priorities.js','backend.js']) vm.runInContext(fs.readFileSync(__dirname+'/'+name,'utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
const inline=[...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
vm.runInContext(inline,context);
const run=code=>vm.runInContext(code,context);
const rows=[{id:'1',n:'Database task',g:25,t:60,d:'2026-10-01',c:'Shared demo',p:1,persisted:true,completed:false}];
<<<<<<< Updated upstream
let failCreate=false,priorityLoads=0,createCalls=0,completionRequests=0;
=======
let failCreate=false,priorityLoads=0,createCalls=0;
let estimateMinutes=90,estimateCalls=0,holdEstimate=false,releaseEstimate=null;
context.testDb={auth:{getSession:async()=>({data:{session:{access_token:'demo-token'}}})},functions:{invoke:async(name,options)=>{
  assert.equal(name,'study-assistant');assert.equal(options.body.action,'suggest_time');estimateCalls++;
  if(holdEstimate)await new Promise(resolve=>{releaseEstimate=resolve});
  return {data:{minutes:estimateMinutes},error:null};
}}};
>>>>>>> Stashed changes
context.testBackend={
  async load(){return rows.map(row=>({...row}))},
  async loadLists(){return []},async loadListAssignments(){return []},
  async loadUserPriorities(){priorityLoads++;return [{scope:'settings',rules:[{type:'title',text:'local'}],ignore_user_rules:false}]},
  async createAssignment(input){createCalls++;if(failCreate)throw new Error('Network unavailable');
    const existing=rows.find(row=>row.requestId===input.requestId);if(existing)return {...existing};
    const row={...input,id:String(rows.length+1),g:null,c:'Shared demo',persisted:true};rows.push(row);return {...row}},
  async save(){completionRequests++;throw new Error('Completion API should not run for a device-only assignment')}
};
(async()=>{
  run("backend=testBackend;db=testDb;user={id:'demo'}");await run('loadTasks()');
  run('openCreate()');assert.equal(element('cd').value,run('TODAY'));
<<<<<<< Updated upstream
  element('cn').value='Local exam';element('cd').value=run('TODAY');element('cc').value='Shared demo';element('ct').value='45m';
=======
  element('ct').value='75m';element('cn').value='Lab report';element('ca').checked=true;run('suggestAssignmentTime()');
  assert.equal(element('ct').value,'75m');assert.equal(element('ct').disabled,false);
  await run("requestTimeSuggestion('Lab report',timeSuggestionVersion)");assert.equal(element('ct').value,'90m');
  estimateMinutes=135;element('cn').value='Lab report (2h 15m)';run('updateTitleSuggestion()');
  await run("requestTimeSuggestion('Lab report (2h 15m)',timeSuggestionVersion)");assert.equal(element('ct').value,'135m');
  assert.equal(estimateCalls,2);
  element('ca').checked=false;run('suggestAssignmentTime()');assert.equal(element('ct').value,'75m');
  element('ca').checked=true;run('suggestAssignmentTime()');holdEstimate=true;
  const pending=run("requestTimeSuggestion('Lab report (2h 15m)',timeSuggestionVersion)");
  for(let i=0;i<5&&!releaseEstimate;i++)await Promise.resolve();assert.ok(releaseEstimate);
  element('ct').value='100m';run('editEstimatedTime()');releaseEstimate();await pending;holdEstimate=false;
  assert.equal(element('ca').checked,false);element('cn').value='Final exam';run('updateTitleSuggestion()');assert.equal(element('ct').value,'100m');
  run('openCreate()');assert.equal(element('ca').checked,false);assert.equal(element('ct').value,'45m');
  element('cn').value='Local exam';element('cd').value=run('TODAY');element('cc').value='Shared demo';element('ct').value='45m';element('cg-unknown').checked=true;
>>>>>>> Stashed changes
  failCreate=true;await run('createA()');
  assert.equal(run('S.A.length'),1);assert.ok(element('ce').textContent.includes('Network unavailable'));
  failCreate=false;await run('createA()');
  assert.equal(createCalls,2);assert.equal(run('S.A.length'),2);assert.equal(run('S.A[1].persisted'),true);
  assert.equal(run('readLocalAssignments().length'),0);assert.equal(rows[1].requestId,run('S.A[1].requestId'));
  await run('loadTasks()');assert.equal(run('S.A.length'),2);assert.equal(priorityLoads,2);
  assert.equal(run('srt(S.A)[0].n'),'Local exam');

<<<<<<< Updated upstream
  const old={id:'local-old',n:'Old device task',d:run('TODAY'),t:30,p:2,o:false,completed:true};
  storage.set(run('LOCAL_KEY'),JSON.stringify([old]));await run('loadTasks()');
  assert.equal(run('S.A.length'),3);assert.ok(element('list').innerHTML.includes('Save to Supabase'));
  failCreate=true;await run("importLocalAssignment('local-old')");
  assert.equal(run('readLocalAssignments().length'),1);assert.equal(run('S.done["local-old"]'),true);
  failCreate=false;await run("importLocalAssignment('local-old')");
  assert.equal(run('readLocalAssignments().length'),0);assert.equal(run('S.A.length'),3);
  assert.equal(rows[2].completed,true);assert.equal(completionRequests,0);
  await run('loadTasks()');assert.equal(run('S.A.length'),3);assert.equal(run('S.A.every(a=>a.persisted)'),true);
  console.log('PASS: database creation, failed save retry, reload, and explicit device assignment import.');
=======
  assert.ok(!element('list').innerHTML.includes('Save to Supabase'));
  assert.ok(!element('list').innerHTML.includes('This device'));
  await run('loadTasks()');assert.equal(run('S.A.length'),2);assert.equal(run('S.A.every(a=>a.persisted)'),true);
  run("S.A[0].c='History <script>';S.tab=1;home()");assert.ok(element('list').innerHTML.includes('History &lt;script&gt;'));assert.ok(!element('list').innerHTML.includes('<script>'));
  console.log('PASS: title time suggestions, manual override, database-only creation, failed save retry, reload, and no device-only assignment controls.');
>>>>>>> Stashed changes
})().catch(error=>{console.error(error);process.exitCode=1});
