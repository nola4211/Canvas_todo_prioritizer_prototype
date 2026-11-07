const cp=require('node:child_process'),assert=require('node:assert/strict');
const {database:db,psql:exe,port}=require('./db.cjs');
const args=['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-w','-v','ON_ERROR_STOP=1'];
const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000b2';
const iss='https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1',aud='https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp';
const browser=owner=>({sub:owner,role:'authenticated',iss,aud:'authenticated'}),agent=owner=>({...browser(owner),aud,client_id:'review-client'});
function query(sql,claims){const r=cp.spawnSync(exe,args,{input:`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='${JSON.stringify(claims)}'; ${sql}; COMMIT;`,encoding:'utf8',windowsHide:true,shell:false});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout.trim());}
query("SELECT public.student_agent_approve_browser('review-client','Reviewer')",browser(B));
query("SELECT public.student_agent_revoke_client_browser('review-client')",browser(B));
assert.equal(query('SELECT public.student_mcp_get_workspace_context()',agent(A)).ok,true,'B cannot revoke A grant for same OAuth client');
assert.equal(query('SELECT public.student_mcp_get_workspace_context()',agent(B)).error_code,'ACCESS_REVOKED');
const first=query("SELECT public.student_agent_revoke_client_browser('review-client')",browser(A));assert.equal(first.data.active,false);assert.equal(first.data.changed,true);
assert.equal(query('SELECT public.student_mcp_get_workspace_context()',agent(A)).error_code,'ACCESS_REVOKED','old unexpired client credentials lose access immediately after app cleanup');
const again=query("SELECT public.student_agent_revoke_client_browser('review-client')",browser(A));assert.equal(again.data.changed,false);assert.equal(again.data.active,false);
assert.throws(()=>query("SELECT public.student_agent_revoke_client_browser('review-client')",agent(A)),/DELEGATED_TOKEN_BLOCKED/);
console.log('PASS native uncertain-consent cleanup: client-id revocation is owner-only, blocks existing credentials, is idempotent, and refuses delegated callers.');
