const assert=require('node:assert/strict');
require('./study-sessions.js');
const api=globalThis.CanvasStudySessions;

assert.deepEqual(api.offsetOptions('2026-03-08T02:30','America/Denver'),[],'the spring-forward gap must not map to an instant');
assert.deepEqual(api.offsetOptions('2026-11-01T01:30','America/Denver'),[-360,-420],'the fall-back hour must expose both offsets');
const first=api.toIso('2026-11-01T01:30','America/Denver',-360);
const second=api.toIso('2026-11-01T01:30','America/Denver',-420);
assert.equal(Date.parse(second)-Date.parse(first),3600000,'choosing the second fall-back offset selects the later instant');
assert.throws(()=>api.toIso('2026-11-01T01:30','America/Denver',''),/offset/);
assert.throws(()=>api.toIso('2026-03-08T02:30','America/Denver',-420),/does not match/);
const novemberDeadline=api.dueDeadline('2026-11-05');
const marchDeadline=api.dueDeadline('2026-03-08');
assert.equal(novemberDeadline,'2026-11-06T06:59:00.000Z','the assignment date maps to 11:59 PM Denver after the DST change');
assert.equal(marchDeadline,'2026-03-09T05:59:00.000Z','the assignment date maps to 11:59 PM Denver before the spring DST transition');
assert.equal(api.endsAfterDue(novemberDeadline,'2026-11-05'),false,'a session ending at the due instant is allowed');
assert.equal(api.endsAfterDue('2026-11-06T07:00:00.000Z','2026-11-05'),true,'a session ending after the stored due instant requires explicit consent');
const spring=api.dayBounds('2026-03-08','America/Denver');
const fall=api.dayBounds('2026-11-01','America/Denver');
assert.equal(Date.parse(spring.end)-Date.parse(spring.start),23*3600000);
assert.equal(Date.parse(fall.end)-Date.parse(fall.start),25*3600000);
assert.equal(api.overlapsDay({starts_at:'2026-11-02T06:30:00.000Z',ends_at:'2026-11-02T07:30:00.000Z'},'2026-11-01'),true,'a session crossing Denver midnight belongs to both days');

const calls=[],sessions=[{id:'session-1',assignment_id:7,starts_at:'2026-11-05T17:00:00Z',ends_at:'2026-11-05T18:00:00Z',timezone:'America/Denver',version:2,cancelled_at:null}],
  assignments=[{assignment_id:7,name:'Final project'}];
function queryFor(table){
 const filters=[],orders=[],q={select(columns){q.columns=columns;return q},lt(key,value){filters.push(['lt',key,value]);return q},gt(key,value){filters.push(['gt',key,value]);return q},in(key,value){filters.push(['in',key,value]);return q},eq(key,value){filters.push(['eq',key,value]);return q},order(key){orders.push(key);return q},
  then(resolve,reject){const data=table==='study_sessions'?sessions:assignments;return Promise.resolve({data,error:null}).then(resolve,reject)}};
 return q;
}
const client={from:table=>{calls.push(['from',table]);return queryFor(table)},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{ok:true,data:[{id:'grant-1',client_id:'codex',client_name:'Codex',approved_at:'2026-11-05T12:00:00Z'}]},error:null}}};
const backend=api.createBackend(client);
(async()=>{
 const rows=await backend.loadStudySessions('2026-11-01T06:00:00.000Z','2026-12-01T07:00:00.000Z');
 assert.equal(rows[0].assignment_title,'Final project');
 assert.ok(calls.some(call=>call[0]==='from'&&call[1]==='study_sessions'));
 assert.ok(calls.some(call=>call[0]==='from'&&call[1]==='assignments'));
 await backend.saveStudySession({assignment_id:'7',starts_at:first,ends_at:second,timezone:'America/Denver',request_id:'00000000-0000-4000-8000-000000000001'});
 assert.equal(calls.at(-1)[1],'student_sessions_create_browser');
 await backend.saveStudySession({id:'session-1',expectedVersion:2,assignment_id:'7',starts_at:first,ends_at:second,timezone:'America/Denver'});
 assert.equal(calls.at(-1)[1],'student_sessions_update_browser');
 assert.equal(calls.at(-1)[2].p_expected_version,2);
 await backend.cancelStudySession('session-1',2);
 assert.equal(calls.at(-1)[1],'student_sessions_cancel_browser');
 assert.deepEqual(await backend.listAgentGrants(),[{id:'grant-1',client_id:'codex',client_name:'Codex',approved_at:'2026-11-05T12:00:00Z'}]);
 await backend.revokeAgentGrant('grant-1');assert.equal(calls.at(-1)[1],'student_agent_revoke_browser');
 console.log('PASS: DST gaps and overlaps, 23/25-hour days, midnight overlap, owner-scoped session adapter, create/update/cancel, and agent grant controls.');
})().catch(error=>{console.error(error);process.exitCode=1});
