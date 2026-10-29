// Regression check for combining device-only assignments with saved priorities.
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
const context = vm.createContext({console,Date,Intl,setTimeout:()=>0,clearTimeout(){},window:{APP_CONFIG:{}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}}});
for (const name of ['priorities.js','backend.js']) vm.runInContext(fs.readFileSync(__dirname+'/'+name,'utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
const inline=[...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
vm.runInContext(inline,context);
const run=code=>vm.runInContext(code,context);
let failLoad=false,completionRequests=0,priorityLoads=0;
context.testBackend={
  async load(){if(failLoad)throw new Error('Network unavailable');return [{id:'1',n:'Database task',g:25,t:60,d:'2026-10-01',c:'Shared demo',p:1,persisted:true,completed:false}]},
  async loadLists(){return []},async loadListAssignments(){return []},
  async loadUserPriorities(){priorityLoads++;return [{scope:'settings',rules:[{type:'title',text:'local'}],ignore_user_rules:false}]},
  async save(){completionRequests++;throw new Error('Local assignments must not use the database completion API')}
};
(async()=>{
  run("backend=testBackend;user={id:'demo'};openCreate()");
  assert.equal(element('cd').value,run('TODAY'));
  element('cn').value='Local exam';element('cd').value=run('TODAY');element('cc').value='Shared demo';element('ct').value='45m';
  run('createA()');
  const localId=run('S.A[0].id');context.localId=localId;
  assert.ok(localId.startsWith('local-'));
  assert.equal(run('readLocalAssignments().length'),1);
  assert.ok(element('list').innerHTML.includes('This device'));
  await run('loadTasks()');
  assert.equal(run('S.A.length'),2);assert.equal(priorityLoads,1);
  assert.equal(run('srt(S.A)[0].id'),localId); // Settings rule applies to the local task too.
  await run('tog(localId)');
  assert.equal(completionRequests,0);
  assert.equal(run('readLocalAssignments()[0].completed'),true);
  run('S.A=[];S.done={}');await run('loadTasks()');
  assert.equal(run('S.A.length'),2);assert.equal(run('S.done[localId]'),true);
  assert.equal(run('S.prioritiesReady'),true);
  failLoad=true;await run('loadTasks()');
  assert.equal(run('S.A.length'),1);assert.equal(run('S.ready'),false);
  assert.ok(element('list').innerHTML.includes('This device'));
  await run('tog(localId)');assert.equal(run('readLocalAssignments()[0].completed'),false);
  run('S.prioritySaving=true');await run('tog(localId)');
  assert.equal(run('readLocalAssignments()[0].completed'),false); // Keep the priority-save lock.
  run('S.prioritySaving=false;S.A[0].g=null;home()');
  assert.ok(element('list').innerHTML.includes('Grade weight not set'));
  assert.ok(element('list').innerHTML.includes('This device'));
  assert.equal(completionRequests,0);
  console.log('PASS: local assignment creation, reload, completion, database-load failure, priority ordering, saving locks, and card labels coexist.');
})().catch(error=>{console.error(error);process.exitCode=1});
