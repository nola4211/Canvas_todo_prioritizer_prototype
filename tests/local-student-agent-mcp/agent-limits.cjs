'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process');
const {database,psql,args,run}=require('./db.cjs');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const A=crypto.randomUUID(),B=crypto.randomUUID();
const browser=id=>({sub:id,role:'authenticated',aud:'authenticated',iss:'https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1'});
const wrap=(sql,owner)=>`begin;set local role authenticated;set local request.jwt.claims=${q(JSON.stringify(browser(owner)))};${sql};commit;`;
const sql=(query,owner)=>run(database,['-qAt'],owner?wrap(query,owner):query);
const approve=(owner,id)=>JSON.parse(sql(`select public.student_agent_approve_browser(${q(id)},'Synthetic limit test')`,owner));
function concurrently(owner,id){return new Promise((resolve,reject)=>{
 const child=cp.spawn(psql,args(database,['-qAt']),{windowsHide:true,shell:false});let stdout='',stderr='';
 child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);
 child.on('exit',code=>resolve({code,stdout,stderr}));
 child.stdin.end(wrap(`select public.student_agent_approve_browser(${q(id)},'Concurrent limit test')`,owner));
});}
(async()=>{
 sql(`insert into auth.users(id) values(${q(A)}),(${q(B)})`);
 for(let i=1;i<=3;i++)assert.equal(approve(A,'limit-'+i).ok,true);
 assert.throws(()=>approve(A,'limit-4'),/AGENT_LIMIT_REACHED/);
 assert.equal(approve(A,'limit-3').ok,true,'refreshing an active approval consumes no new slot');
 sql("select public.student_agent_revoke_client_browser('limit-1')",A);
 assert.equal(approve(A,'limit-4').ok,true,'disconnect frees one slot');
 assert.throws(()=>approve(A,'limit-1'),/AGENT_LIMIT_REACHED/,'reactivation consumes a slot');
 assert.throws(()=>sql(`insert into public.student_agent_connection_limits(owner_id,connection_limit,approval_reason) values(${q(A)},10,'self approved')`,A),/permission denied/);
 sql(`insert into public.student_agent_connection_limits(owner_id,connection_limit,approval_reason) values(${q(A)},4,'Project administrator approved extra slot for synthetic test')`);
 assert.equal(approve(A,'limit-1').ok,true,'administrator override permits an extra slot');
 assert.throws(()=>approve(A,'limit-5'),/AGENT_LIMIT_REACHED/);
 const results=await Promise.all(Array.from({length:5},(_,i)=>concurrently(B,'race-'+i)));
 assert.equal(results.filter(r=>r.code===0).length,3,'concurrent requests cannot exceed three');
 for(const result of results.filter(r=>r.code!==0))assert.match(result.stderr,/AGENT_LIMIT_REACHED/);
 assert.equal(sql(`select count(*) from public.student_agent_grants where owner_id=${q(B)} and revoked_at is null`),'3');
 console.log('PASS: three-agent default, active reapproval, disconnect/reactivation, admin-only extra slots, and concurrent cap enforcement.');
})().catch(error=>{console.error(error);process.exitCode=1});
