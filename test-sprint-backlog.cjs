const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('./assignment-fields.js');require('./study-sessions.js');require('./backend.js');require('./calendar-export.js');
const fields=AssignmentFields;
assert.equal(fields.maxDueDate('2028-02-29'),'2029-02-28');
assert.equal(fields.maxDueDate('2027-03-01'),'2028-03-01');
const input={n:'Lab',c:'IS 401',d:fields.maxDueDate(),t:30,o:false,g:null};
assert.equal(fields.validate(input).d,input.d);
const next=new Date(input.d+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
assert.throws(()=>fields.validate({...input,d:next.toISOString().slice(0,10)}),/one year/);
assert.equal(fields.validate({...input,d:'2099-12-01',allowPast:true,originalDueDate:'2099-12-01'}).d,'2099-12-01');
assert.throws(()=>fields.validate({...input,d:'2099-12-02',allowPast:true,originalDueDate:'2099-12-01'}),/one year/);
let lastPatch;
const client={from(){const q={update(p){lastPatch=p;return q},eq(){return q},select(){return q},async single(){return {data:{assignment_id:1,name:'Lab',class_name:'IS 401',completed:false,due_date:lastPatch.due_date||'2099-12-02T06:59:59Z',est_time:'00:30:00',priority:2}}}};return q}};
const elements=new Map();let missing=new Set();
function el(id){if(missing.has(id))return null;if(!elements.has(id)){const classes=new Set();elements.set(id,{value:'',textContent:'',innerHTML:'',checked:false,hidden:false,disabled:false,style:{},classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on??!classes.has(c))classes.add(c);else classes.delete(c)}},setAttribute(){},addEventListener(){},focus(){},parentElement:{querySelector:()=>null}})}return elements.get(id)}
const context=vm.createContext({console,Date,Intl,URL,Blob,crypto:require('node:crypto').webcrypto,window:{APP_CONFIG:{}},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},setTimeout:()=>0,clearTimeout(){}});
for(const file of ['priorities.js','assignment-fields.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
vm.runInContext([...fs.readFileSync('index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],context);
const run=s=>vm.runInContext(s,context);
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
(async()=>{
 const b=CanvasBackend.create(client,['1']);
 await b.updateAssignment('1',{...input,p:3,d:'2099-12-01',originalDueDate:'2099-12-01'});assert.equal(lastPatch.priority,3,'priority from the team form survives the merged edit path');
 assert.equal(Object.hasOwn(lastPatch,'due_date'),false,'unchanged legacy date preserves stored instant');
 const saved=await b.updateAssignment('1',{...input,originalDueDate:'2026-01-01'});
 assert.equal(lastPatch.due_date,CanvasStudySessions.dueDeadline(input.d,'America/Denver'));
 assert.equal(saved.d,input.d,'edited date does not shift to the previous Denver day');
 context.persistDraft=async(input,id)=>({...input,id:id||'draft-1'});run("user={id:'owner-a'};backend={saveAssignmentDraft:persistDraft};S.ready=true;S.listsReady=true;S.prioritiesReady=true");
 run('openCreate()');el('cn').value='<Unfinished>';el('cc').value='IS 401';el('cd').value='';el('ct').value='';
 await run('saveDraftC()');assert.equal(run('S.drafts.length'),1);assert.ok(el('pb').innerHTML.includes('&lt;Unfinished&gt;'));assert.ok(el('pb').innerHTML.includes('Saved drafts stay in your account'));
 run('resume(0)');assert.equal(el('cd').value,'');assert.equal(el('ct').value,'');
 el('cn').value='Cancelled changes';run('cancelC()');assert.equal(run('S.drafts.length'),1);assert.equal(run('S.drafts[0].n'),'<Unfinished>');run('resume(0)');el('cn').value='Updated draft';await run('saveDraftC()');assert.equal(run('S.drafts.length'),1);assert.equal(run('S.drafts[0].n'),'Updated draft');
 run('resume(0)');el('cd').value=fields.today();el('ct').value='30m';el('cg-unknown').checked=true;
 context.testDue=fields.today();run("backend={createAssignment:async()=>{throw Error('Offline')}}");await run('createA()');assert.equal(run('S.drafts.length'),1,'failed creation retains draft');
 const creation=defer();let creates=0;context.createSaved=()=>{creates++;return creation.promise};run("backend={createAssignment:createSaved,deleteAssignmentDraft:async id=>{if(id!=='draft-1')throw Error('Wrong draft removed')}}");
 const save=run('createA()');await run('createA()');assert.equal(creates,1,'rapid submit does not duplicate');
 creation.resolve({id:'5',n:'Updated draft',c:'IS 401',d:fields.today(),completed:false});await save;
 assert.equal(run('S.drafts.length'),0);assert.equal(run('S.A.length'),1);
 run("S.A.push({id:'6',n:'Completed only',c:'IS 401',d:testDue});S.done['6']=true");
 assert.ok(run('completedAssignmentsMarkup()').includes('Completed only'));assert.ok(!run('completedAssignmentsMarkup()').includes('Updated draft'));
 run("S.done['6']=false");assert.ok(run('completedAssignmentsMarkup()').includes('No completed assignments yet'));
 // Export the visible month only, with an actual calendar Blob and download link.
 let exportBlob,downloaded=0,downloadName='';context.CanvasCalendarExport=CanvasCalendarExport;
 context.URL={createObjectURL(blob){exportBlob=blob;return 'blob:synthetic'},revokeObjectURL(){}};
 context.document.body={appendChild(){}};context.document.createElement=()=>({set download(value){downloadName=value},click(){downloaded++},remove(){}});
 run("S.cy=Number(testDue.slice(0,4));S.cm=Number(testDue.slice(5,7))-1;S.sessions=[];S.A.push({id:'7',n:'Other month',c:'IS 401',d:'2099-01-01'})");
 run('exportCalendar()');assert.equal(downloaded,1);assert.equal(downloadName,'student-schedule-'+fields.today().slice(0,7)+'.ics');
 const exported=await exportBlob.text();assert.ok(exported.includes('Updated draft'));assert.ok(!exported.includes('Other month'));
 run('S.sessionsLoading=true;exportCalendar()');assert.equal(downloaded,1);run("S.sessionsLoading=false;S.A=S.A.filter(a=>a.id!=='7')");
 // Leaving Settings during an async failure used to dereference removed DOM elements.
 const grants=defer();context.getGrants=()=>grants.promise;run('sessionBackend={listAgentGrants:getGrants}');
 const loading=run('loadAgentGrants()');missing=new Set(['agent-status','agent-list']);grants.reject(Error('Offline'));await loading;assert.equal(run('S.agentsLoading'),false);missing.clear();
 const priority=defer();let priorities=0;context.writePriority=()=>{priorities++;return priority.promise};run('backend={updateAssignmentPriority:writePriority};S.ready=true');
 const changing=run("changeAssignmentPriority('5',3)");await run("changeAssignmentPriority('5',1)");assert.equal(priorities,1);
 run("++loadVersion;user={id:'owner-b'};clearTransientWorkspace();S.A=[]");priority.resolve({id:'5',n:'Old owner task',p:3});await changing;assert.equal(run('S.A.length'),0,'late result cannot enter another account');
 // Repeated deletion submits once; a late result cannot remove the next account's row.
 const removal=defer();let removes=0;context.removeSaved=()=>{removes++;return removal.promise};
 run("backend={removeAssignment:removeSaved};S.A=[{id:'5',n:'Synthetic target'}];pendingRemoval='5'");
 const deleting=run('confirmRemoval()');await run('confirmRemoval()');assert.equal(removes,1);
 run("++loadVersion;user={id:'owner-c'};clearTransientWorkspace();S.A=[{id:'5',n:'Next account task'}]");removal.resolve();await deleting;
 assert.equal(run('S.A[0].n'),'Next account task');assert.equal(el('remove-confirm').disabled,false);
 run('S.A=[]');
 // A late assignment save also cannot enter the next account.
 const late=defer();context.lateCreate=()=>late.promise;run("backend={createAssignment:lateCreate};S.ready=true;openCreate()");el('cn').value='Late';el('cc').value='IS 401';el('cd').value=fields.today();el('ct').value='30m';el('cg-unknown').checked=true;
 const pending=run('createA()');run("++loadVersion;user=null;clearTransientWorkspace();S.A=[]");late.resolve({id:'9',n:'Late'});await pending;assert.equal(run('S.A.length'),0);assert.equal(run('S.createSaving'),false);assert.equal(el('create-submit').disabled,false);assert.equal(run('S.drafts.length'),0);
 console.log('PASS: one-year boundary and leap day, unchanged legacy dates, Denver edit timestamps, partial/escaped/resumable drafts, save failure retention, duplicate submits/removals, Completed view, calendar Blob/download and month filtering, missing Settings DOM, duplicate priorities, and stale-account results.');
})().catch(e=>{console.error(e);process.exitCode=1});
