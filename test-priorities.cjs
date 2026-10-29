const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('./priorities.js');
const P = globalThis.CanvasPriorities;
const tasks = [
 {id:'1',n:'EXAM 1',g:25,d:'2026-12-01',t:60,c:'IS401'},
 {id:'2',n:'Chapter Readings',g:5,d:'2026-10-01',t:30,c:'History'},
 {id:'3',n:'Exam practice assignment',g:10,d:'2026-11-01',t:null,c:'IS401'},
 {id:'4',n:'Assignment without dates or weight',g:null,d:'9999-12-31',t:120,c:'Writing'}
];
const ids=rows=>Array.from(rows,row=>row.id).join(',');
assert.equal(ids(P.sortAssignments(tasks,[],[{type:'grade'}])),'1,3,2,4');
assert.equal(ids(P.sortAssignments(tasks,[{type:'title',text:'readings'}],[{type:'grade'}])),'2,1,3,4');
assert.equal(ids(P.sortAssignments(tasks,[{type:'title',text:'readings'}],[{type:'grade'}],true)),'1,3,2,4');
assert.equal(ids(P.sortAssignments(tasks,[],[{type:'title',text:'exam'},{type:'due'}])),'3,1,2,4');
assert.equal(ids(P.sortAssignments(tasks,[],[{type:'title',text:'assignment'},{type:'grade'}])),'3,4,1,2');
assert.equal(ids(P.sortAssignments(tasks,[],[])),'2,3,1,4');
assert.equal(ids(P.sortAssignments(tasks,[{type:'grade'}],[],true)),'2,3,1,4');
assert.equal(ids(P.sortAssignments(tasks,[{type:'grade'}],[{type:'title',text:'practice'}])),'1,3,2,4');
const tiedWeights=tasks.map(task=>({...task,g:task.id==='3'?25:task.g}));
assert.equal(ids(P.sortAssignments(tiedWeights,[{type:'grade'}],[{type:'title',text:'practice'}])),'3,1,2,4');
assert.equal(ids(P.sortAssignments([...tasks].reverse(),[],[])),'2,3,1,4');
assert.equal(ids(P.sortAssignments(tasks,[],[{type:'time'}])),'4,1,2,3');
assert.equal(ids(P.sortAssignments(tasks,[],[{type:'title',text:'[exam]'}])),'2,3,1,4'); // literal, not regex
assert.equal(tasks[0].id,'1'); // no mutation of input
assert.equal(P.validateRules([{type:'title',text:'  Exam  '}])[0].text,'Exam');
for(const rules of [null,{},[{type:'class_grade'}],[{type:'due'},{type:'due'}],[{type:'title',text:' '}],[{type:'title',text:'x'.repeat(81)}],[{type:'title',text:'EXAM'},{type:'title',text:'exam'}],Array(11).fill({type:'due'})])assert.throws(()=>P.validateRules(rules));

// Use the real adapter and page with a small simulated database.
const elements=new Map();
function element(id){
 if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,
  classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){}});
 return elements.get(id);
}
const controls=[element('test-control')];
const context=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,window:{APP_CONFIG:{}},
 document:{getElementById:element,querySelectorAll:selector=>selector==='[data-priority-control]'?controls:[],addEventListener(){}}});
vm.runInContext(fs.readFileSync(__dirname+'/priorities.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/backend.js','utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
vm.runInContext([...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],context);
const tables={user_priorities:[],lists:[{id:'list-1',name:'Study',priority_rules:[],ignore_user_rules:false}]};
let fail=false,hold=null,writes=0;
const client={from(table){
 let patch=null,upsert=false,filters=[];
 const q={select(){return q},order(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},
  upsert(value){patch=value;upsert=true;writes++;return q},update(value){patch=value;writes++;return q},
  single(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}};
 async function execute(single){
  if(hold)await new Promise(resolve=>hold=resolve);
  if(fail)return {error:{message:'Network unavailable'}};
  let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));
  if(upsert){
   let row=tables[table].find(row=>row.scope===patch.scope);
   if(!row){row={};tables[table].push(row)}
   Object.assign(row,patch);rows=[row];
  }else if(patch)rows.forEach(row=>Object.assign(row,patch));
  if(single&&rows.length!==1)return {error:{message:'No saved row'}};
  return {data:JSON.parse(JSON.stringify(single?rows[0]:rows)),error:null};
 }
 return q;
}};
const run=code=>vm.runInContext(code,context);
context.testBackend=context.CanvasBackend.create(client,['1','2','3','4']);context.testTasks=tasks;
(async()=>{
 run("backend=testBackend;user={id:'demo'};S.A=testTasks;S.ready=true;S.listsReady=true;S.lists.push({id:'list-1',name:'Study',priority_rules:[],ignore_user_rules:false});S.tab=2");
 await run('loadSavedPriorities(loadVersion)');assert.equal(run('S.prioritiesReady'),true);
 run("openPriorityEditor('settings');S.priorityDraft.rules=[{type:'title',text:'readings'}]");
 assert.equal(run('S.userRules.length'),0); // drafts are separate
 await run('savePriorityRules()');assert.equal(tables.user_priorities[0].rules[0].text,'readings');
 run("openPriorityEditor('list');S.priorityDraft.rules=[{type:'grade'}]");
 hold=true;const saving=run('savePriorityRules()');
 assert.equal(run('S.prioritySaving'),true);assert.equal(controls[0].disabled,true);
 assert.equal(element('signout').disabled,true);
 const before=writes;await run('savePriorityRules()');assert.equal(writes,before);
 const release=hold;hold=null;release();await saving;
 assert.equal(run('S.lists[2].priority_rules[0].type'),'grade');
 assert.equal(ids(run('srt(S.A)')),'2,1,3,4');
 run('S.priorityDraft.ignoreUserRules=true');await run('savePriorityRules()');
 assert.equal(ids(run('srt(S.A)')),'1,3,2,4');
 run('S.userRules=[];S.viewPriorities={};S.lists[2].priority_rules=[]');
 await run('loadSavedPriorities(loadVersion)');
 context.savedLists=await context.testBackend.loadLists();run('S.lists[2]=savedLists[0]');
 assert.equal(ids(run('srt(S.A)')),'1,3,2,4'); // refresh restores override and both rule sets
 run("openPriorityEditor('list');S.priorityDraft.rules=[{type:'due'}]");
 fail=true;await run('savePriorityRules()');
 assert.equal(run('S.lists[2].priority_rules[0].type'),'grade');assert.ok(element('priority-message').textContent.includes('Network unavailable'));
 assert.equal(run('S.prioritySaving'),false);assert.equal(controls[0].disabled,false);
 fail=false;
 run("S.tab=0;openPriorityEditor('list');S.priorityDraft.rules=[{type:'due'}];S.priorityDraft.ignoreUserRules=true");
 await run('savePriorityRules()');assert.equal(tables.user_priorities.find(row=>row.scope==='main').ignore_user_rules,true);
 assert.equal(ids(run('srt(S.A)')),'2,3,1,4');
 run("openPriorityEditor('list');S.priorityDraft.rules=[{type:'title',text:'<Exam>'}];renderPriorityRules()");
 assert.ok(element('sortrows').innerHTML.includes('&lt;Exam&gt;'));
 const previous=writes;run("S.priorityDraft.rules=[{type:'title',text:''}]");await run('savePriorityRules()');assert.equal(writes,previous);
 // A session ending while a request is in flight must not populate the next user's state.
 run("openPriorityEditor('settings');S.priorityDraft.rules=[{type:'grade'}]");
 hold=true;const stale=run('savePriorityRules()');run('++loadVersion;resetLists();user=null');
 const finish=hold;hold=null;finish();await stale;
 assert.equal(run('S.userRules.length'),0);assert.equal(run('S.prioritiesReady'),false);
 run('S.prioritiesReady=true;S.listsReady=true');
 await run('loadSavedPriorities(loadVersion-1)');await run('loadSavedLists(loadVersion-1)');
 assert.equal(run('S.prioritiesReady'),true);assert.equal(run('S.listsReady'),true);
 fail=true;await run('loadSavedPriorities(loadVersion)');assert.equal(run('S.prioritiesReady'),false);
 assert.equal(element('sync-error').hidden,false);
 console.log('PASS: priority precedence, overrides, rule order, title matching, missing values, validation, saves/reload, built-in views, cancellation-safe drafts, failed saves, saving locks, escaping, stale-session results, and load failure.');
})().catch(error=>{console.error(error);process.exitCode=1});
