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
for (const name of ['assignment-fields.js','priorities.js','backend.js']) vm.runInContext(fs.readFileSync(__dirname+'/'+name,'utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
const inline=[...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
vm.runInContext(inline,context);
const run=code=>vm.runInContext(code,context);
const rows=[{id:'1',n:'Database task',g:25,t:60,d:'2026-10-01',c:'Shared demo',p:1,persisted:true,completed:false}];
let failCreate=false,priorityLoads=0,createCalls=0,completionRequests=0;
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
  run("backend=testBackend;user={id:'demo'}");await run('loadTasks()');
  run('openCreate()');assert.equal(element('cd').value,run('TODAY'));
  element('cn').value='Local exam';element('cd').value=run('TODAY');element('cc').value='Shared demo';element('ct').value='45m';element('cg-unknown').checked=true;
  failCreate=true;await run('createA()');
  assert.equal(run('S.A.length'),1);assert.ok(element('ce').textContent.includes('Network unavailable'));
  failCreate=false;await run('createA()');
  assert.equal(createCalls,2);assert.equal(run('S.A.length'),2);assert.equal(run('S.A[1].persisted'),true);
  assert.equal(run('readLocalAssignments().length'),0);assert.equal(rows[1].requestId,run('S.A[1].requestId'));
  await run('loadTasks()');assert.equal(run('S.A.length'),2);assert.equal(priorityLoads,2);
  assert.equal(run('srt(S.A)[0].n'),'Local exam');

  const old={id:'local-old',n:'Old device task',d:run('TODAY'),t:30,p:2,o:false,completed:true};
  storage.set(run('LOCAL_KEY'),JSON.stringify([old]));await run('loadTasks()');
  assert.equal(run('S.A.length'),3);assert.ok(element('list').innerHTML.includes('Save to Supabase'));
  failCreate=true;await run("importLocalAssignment('local-old')");
  assert.equal(run('readLocalAssignments().length'),1);assert.equal(run('S.done["local-old"]'),true);
  failCreate=false;await run("importLocalAssignment('local-old')");
  assert.equal(run('readLocalAssignments().length'),0);assert.equal(run('S.A.length'),3);
  assert.equal(rows[2].completed,true);assert.equal(completionRequests,0);
  await run('loadTasks()');assert.equal(run('S.A.length'),3);assert.equal(run('S.A.every(a=>a.persisted)'),true);
  run("S.A[0].c='History <script>';S.tab=1;home()");assert.ok(element('list').innerHTML.includes('History &lt;script&gt;'));assert.ok(!element('list').innerHTML.includes('<script>'));
  console.log('PASS: database creation, failed save retry, reload, and explicit device assignment import.');
})().catch(error=>{console.error(error);process.exitCode=1});
