const cp=require('node:child_process'),assert=require('node:assert/strict');
const {database:db,psql:exe,port}=require('./db.cjs');
const args=['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-w','-v','ON_ERROR_STOP=1'];
const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000b2';
const issuer='https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1',aud='https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const claims=(owner,client='review-client')=>({sub:owner,role:'authenticated',iss:issuer,aud,client_id:client});
const wrap=(sql,c)=>`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims=${q(JSON.stringify(c))}; ${sql}; COMMIT;`;
function sync(sql,c){const r=cp.spawnSync(exe,args,{input:c?wrap(sql,c):sql,encoding:'utf8',windowsHide:true,shell:false});if(r.status)throw Error(r.stderr);return r.stdout.trim();}
function asyncSql(sql,c){return new Promise((resolve,reject)=>{let out='',err='';const p=cp.spawn(exe,args,{windowsHide:true,shell:false});p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(JSON.parse(out.trim().split('\n')[0])));p.stdin.end(wrap(sql,c));});}
const aid=sync(`SELECT assignment_id FROM public.assignments WHERE owner_id=${q(A)} ORDER BY assignment_id LIMIT 1`);
const bid=sync(`SELECT assignment_id FROM public.assignments WHERE owner_id=${q(B)} ORDER BY assignment_id LIMIT 1`);
const read=(sql,c)=>JSON.parse(sync(sql,c));
const create=(id,request,extra='false',start="date_trunc('day',now())+interval '5 days 10 hours'",end="date_trunc('day',now())+interval '5 days 11 hours'")=>`SELECT public.student_mcp_create_study_session(${id},${start},${end},'UTC',${q(request)},${extra})`;
(async()=>{
 sync('DELETE FROM public.student_agent_rate_limits');
 const results=await Promise.all([
   asyncSql(create(aid,crypto.randomUUID())+';SELECT pg_sleep(1)',claims(A)),
   asyncSql(create(aid,crypto.randomUUID()),claims(A))
 ]);
 assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.error_code==='SCHEDULE_OVERLAP').length,1);
 assert.equal(sync(`SELECT count(*) FROM public.study_sessions WHERE owner_id=${q(A)} AND cancelled_at IS NULL`),'1');
 assert.equal(read(create(bid,crypto.randomUUID()),claims(B)).ok,true);
 console.log('PASS native concurrent overlapping transactions: exactly one commits for same owner; different owner may use same time');
 const crossStart="date_trunc('day',now())+interval '7 days 23 hours 30 minutes'",crossEnd="date_trunc('day',now())+interval '8 days 30 minutes'";
 const cross=read(create(aid,crypto.randomUUID(),'false',crossStart,crossEnd),claims(A));assert.equal(cross.ok,true);
 const day8=read("SELECT public.student_mcp_list_study_sessions(date_trunc('day',now())+interval '8 days',date_trunc('day',now())+interval '9 days')",claims(A));
 assert.ok(day8.data.study_sessions.some(x=>x.id===cross.data.id));
 const lateArgs=create(aid,crypto.randomUUID(),'false',"now()+interval '30 days'","now()+interval '30 days 1 hour'");
 assert.equal(read(lateArgs,claims(A)).error_code,'VALIDATION_ERROR');
 const late=read(lateArgs.replace(',false)',',true)'),claims(A));assert.equal(late.ok,true);assert.deepEqual(late.warnings,['SESSION_AFTER_DUE']);
 assert.equal(read(create(bid,crypto.randomUUID(),'false',"now()+interval '12 days'","now()+interval '12 days 1 hour'"),claims(A)).error_code,'NOT_FOUND');
 const tooShort=read(create(aid,crypto.randomUUID(),'false',"now()+interval '13 days'","now()+interval '13 days 4 minutes'"),claims(A));assert.equal(tooShort.error_code,'VALIDATION_ERROR');
 const invalidZone=read(create(aid,crypto.randomUUID(),'false',"now()+interval '14 days'","now()+interval '14 days 1 hour'").replace("'UTC'","'Invalid/Timezone'"),claims(A));assert.equal(invalidZone.error_code,'VALIDATION_ERROR');
 console.log('PASS cross-midnight interval queries, explicit after-deadline warning/permission, foreign assignment and invalid duration/timezone');
 const browser={...claims(A),aud:'authenticated'};delete browser.client_id;
 assert.equal(read("SELECT public.student_agent_approve_browser('second-review-client','Second reviewer')",browser).ok,true);
 sync('DELETE FROM public.student_agent_rate_limits');
 for(const client of ['review-client','second-review-client']){
   const entries=read('SELECT jsonb_agg(public.student_mcp_get_workspace_context()) FROM generate_series(1,30)',claims(A,client));assert.equal(entries.filter(x=>x.ok).length,30);
 }
 assert.equal(read('SELECT public.student_mcp_get_workspace_context()',claims(A)).error_code,'RATE_LIMITED');
 console.log('PASS 60-call quota is shared across two different OAuth clients for the same owner');
 sync('DELETE FROM public.student_agent_rate_limits');
 console.log('ALL CONCURRENCY AND EDGE CHECKS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
