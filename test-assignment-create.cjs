const assert=require('node:assert/strict');
require('./assignment-fields.js');require('./backend.js');
const rows=[];let calls=0;const requestId='00000000-0000-4000-8000-000000000001';
const client={async rpc(name,p){
 assert.equal(name,'create_saved_assignment');calls++;
 let row=rows.find(r=>r.client_request_id===p.p_request_id);
 if(!row){row={assignment_id:4,name:p.p_name,class_name:p.p_class_name,due_date:p.p_due_date+'T23:00:00Z',est_time:'01:30:00',optional:p.p_optional,percentage_of_grade:p.p_percentage_of_grade,priority:p.p_optional?0:2,completed:p.p_completed,client_request_id:p.p_request_id};rows.push(row)}
 return {data:row};
},from(){return {insert(){return this},select(){return this},single:async()=>({data:{list_id:'study',assignment_id:4}})}}};
(async()=>{
 const backend=CanvasBackend.create(client,['1','2','3']);const due=AssignmentFields.today();
 const input={n:'Lab report',c:'IS 401',d:due,t:90,o:true,g:25,completed:false,requestId};
 const first=await backend.createAssignment(input);assert.equal(first.id,'4');assert.equal(first.c,'IS 401');assert.equal(first.g,25);assert.equal(first.t,90);assert.equal(first.o,true);
 assert.equal((await backend.createAssignment(input)).id,first.id);assert.equal(calls,2);assert.equal(rows.length,1);
 assert.equal((await backend.addAssignmentToList('study','4')).assignment_id,'4');
 for(const patch of [{n:' '},{c:' '},{t:0},{t:10081},{g:101},{g:NaN},{o:null},{d:'2026-02-30'}])await assert.rejects(backend.createAssignment({...input,...patch}));
 assert.equal(AssignmentFields.validate({...input,g:null}).g,null);assert.equal(AssignmentFields.validate({...input,g:0}).g,0);
 console.log('PASS: shared RPC creation, field validation, class/grade readback, retry identity, and new assignment list membership.');
})().catch(e=>{console.error(e);process.exitCode=1});
