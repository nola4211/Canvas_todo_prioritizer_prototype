// Simulated database requests and UI behavior. Security is tested separately in SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value:'', innerHTML:'', textContent:'', hidden:false, disabled:false,
    classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){} });
  return elements.get(id);
}
const context = vm.createContext({console,Date,Intl,setTimeout,clearTimeout,confirm:()=>true,
  window:{APP_CONFIG:{}},document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}}});
vm.runInContext(fs.readFileSync(__dirname+'/backend.js','utf8'),context);
context.CanvasBackend=context.window.CanvasBackend;
vm.runInContext([...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],context);
const api=context.CanvasBackend;
const tables={lists:[],list_assignments:[]};
let next=1,fail=false,hold=null;
const client={from(table){
  let action='select',value,filters=[];
  const query={
    select(){return query},order(){return query},
    eq(key,value){filters.push(row=>String(row[key])===String(value));return query},
    insert(row){action='insert';value=row;return query},
    update(row){action='update';value=row;return query},
    delete(){action='delete';return query},
    single(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}
  };
  async function execute(single){
    if(hold)await new Promise(resolve=>hold=resolve);
    if(fail)return {data:null,error:{message:'Network unavailable'}};
    let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));
    if(action==='insert'){
      if(table==='lists'&&tables.lists.some(row=>row.name.toLowerCase()===value.name.toLowerCase()))return {error:{code:'23505'}};
      if(table==='list_assignments'&&tables[table].some(row=>row.list_id===value.list_id&&row.assignment_id===value.assignment_id))return {error:{code:'23505'}};
      const row=table==='lists'?{id:'list-'+next++,...value}:{...value};tables[table].push(row);rows=[row];
    }
    if(action==='update')rows.forEach(row=>Object.assign(row,value));
    if(action==='delete'){
      tables[table]=tables[table].filter(row=>!rows.includes(row));
      if(table==='lists')tables.list_assignments=tables.list_assignments.filter(m=>!rows.some(row=>row.id===m.list_id));
    }
    if(single&&rows.length!==1)return {error:{message:'Expected one saved row'}};
    return {data:JSON.parse(JSON.stringify(single?rows[0]:rows)),error:null};
  }
  return query;
}};
const run=code=>vm.runInContext(code,context);
(async()=>{
 const backend=api.create(client,['1','2']);context.testBackend=backend;
 run("backend=testBackend;user={id:'demo'};S.ready=true;S.listsReady=true;S.A=[{id:'1',n:'<Homework>',c:'Shared demo',d:'2026-12-01',t:30,g:10,p:1,persisted:true}]");
 await assert.rejects(backend.createList('  '),/between/);
 await assert.rejects(backend.createList('x'.repeat(101)),/between/);
 element('ln').value='  Projects  ';await run('saveNewList()');
 assert.equal(tables.lists[0].name,'Projects');assert.equal(run('S.lists[2].id'),'list-1');
 await assert.rejects(backend.createList('PROJECTS'),/already exists/);
 assert.ok(element('pb').innerHTML.includes('&lt;Homework&gt;'));
 const checkbox={dataset:{listAssignment:'1'},checked:true};context.checkbox=checkbox;
 hold=true;const pending=run('changeListAssignment(checkbox)');
 assert.equal(checkbox.checked,false);assert.equal(run('S.listSaving'),true);
 assert.equal(element('reload-tasks').disabled,true);
 await run('changeListAssignment(checkbox)'); // second operation is ignored
 const release=hold;hold=null;release();await pending;
 assert.equal(tables.list_assignments.length,1);assert.equal(checkbox.checked,true);
 const second=await backend.createList('This Week');await backend.addAssignmentToList(second.id,'1');
 assert.equal(tables.list_assignments.length,2);
 element('ln').value='Renamed';await run('saveListName()');assert.equal(tables.lists[0].name,'Renamed');
 assert.equal(tables.list_assignments[0].list_id,'list-1');
 run('S.memberships=[]');await run('loadSavedLists(loadVersion)');assert.equal(run('S.memberships.length'),2);
 run('S.tab=2');checkbox.checked=false;fail=true;await run('changeListAssignment(checkbox)');
 assert.equal(checkbox.checked,true);assert.equal(run('S.memberships.length'),2);
 assert.ok(element('list-message').textContent.includes('Network unavailable'));
 fail=false;checkbox.checked=false;await run('changeListAssignment(checkbox)');
 assert.equal(tables.list_assignments.length,1);assert.equal(run('S.A.length'),1);
 await run('deleteCurrentList()');assert.equal(tables.lists.length,1);assert.equal(run('S.A.length'),1);
 await run('loadSavedLists(loadVersion)');assert.equal(run('S.lists.length'),3);
 assert.equal(tables.lists.some(list=>list.name==='Study'),false); // no load-time recreation
 run('resetLists()');assert.equal(run('S.memberships.length'),0);assert.equal(run('S.lists.length'),2);
 fail=true;await run('loadSavedLists(loadVersion)');assert.equal(run('S.listsReady'),false);
 console.log('PASS: list validation, creation, rename, deletion, reload, multiple membership, escaping, confirmed checkbox saves, request lock, failures, assignment preservation, and session clearing.');
})().catch(error=>{console.error(error);process.exitCode=1});
