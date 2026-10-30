const assert = require('node:assert/strict');
require('./backend.js');
const { CanvasBackend } = globalThis;

const requestId='00000000-0000-4000-8000-000000000001';
const rows=[];
let insertCalls=0, listCalls=0;
const client={from(table){
  if(table==='list_assignments')return {insert(){listCalls++;return this},select(){return this},single(){return Promise.resolve({data:{list_id:'study',assignment_id:4},error:null})}};
  assert.equal(table,'assignments');
  let operation='select',payload=null,filter=null;
  const query={
    select(){return query},eq(key,value){if(key==='client_request_id')filter=value;return query},order(){return query},
    insert(value){operation='insert';payload=value;insertCalls++;return query},
    update(value){operation='update';payload=value;return query},
    single:async()=>{
      if(operation==='insert'){
        if(rows.some(row=>row.client_request_id===payload.client_request_id))return {data:null,error:{code:'23505'}};
        const row={...payload,assignment_id:4,est_time:'01:30:00'};rows.push(row);return {data:row,error:null};
      }
      if(operation==='update')return {data:{assignment_id:4,completed:payload.completed},error:null};
      return {data:rows.find(row=>row.client_request_id===filter),error:null};
    },
    then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}
  };
  return query;
}};
(async()=>{
  const backend=CanvasBackend.create(client,['1','2','3']);
  const input={n:'Lab report',d:'2026-11-01',t:90,p:2,o:true,completed:false,requestId};
  const first=await backend.createAssignment(input);
  assert.equal(first.id,'4');assert.equal(first.d,input.d);assert.equal(first.t,90);
  assert.equal(first.o,true);assert.equal(first.g,null);
  assert.equal(rows[0].due_date,'2026-11-02T06:59:00.000Z'); // 11:59 pm Denver after DST ends.
  const retry=await backend.createAssignment(input);
  assert.equal(retry.id,first.id);assert.equal(rows.length,1);assert.equal(insertCalls,2);
  assert.equal((await backend.addAssignmentToList('study','4')).assignment_id,'4');assert.equal(listCalls,1);
  assert.equal(await backend.save('4',false,true),true);
  await assert.rejects(backend.createAssignment({...input,n:' '}),/name between/);
  let selects=0;
  const legacyClient={from(){return {fields:'',select(fields){this.fields=fields;return this},eq(){return this},order(){return this},
    then(resolve){selects++;return Promise.resolve(this.fields.includes('optional')
      ? {data:null,error:{code:'42703',message:'column assignments.optional does not exist'}}
      : {data:[{assignment_id:1,name:'Seeded',percentage_of_grade:10,completed:false,priority:1,
          due_date:'2026-10-11T05:59:00Z',est_time:'01:00:00',deleted:false}],error:null}).then(resolve)}
  }}};
  const legacyTasks=await CanvasBackend.create(legacyClient,['1']).load();
  assert.equal(selects,2);assert.equal(legacyTasks[0].id,'1');
  console.log('PASS: assignment insert, Denver due date, duplicate retry, list membership, completion, and legacy load fallback.');
})().catch(error=>{console.error(error);process.exitCode=1});
