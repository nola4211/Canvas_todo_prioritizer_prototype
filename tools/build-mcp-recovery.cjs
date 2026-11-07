'use strict';
// Generate a pre-launch-only recovery script from a read-only hosted snapshot.
// Refuses to discard any saved session/grant rows. Not a post-launch rollback.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const snapshotPath=process.argv[2],outputPath=process.argv[3];
if(!snapshotPath||!outputPath)throw Error('Pass snapshot JSON and output SQL paths');
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
if(snapshot.schemas.some(s=>s.name==='private'))throw Error('Existing private schema requires a custom recovery plan');
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const moved=['create_saved_assignment','create_ai_chat','begin_ai_turn','confirm_ai_assignment','change_ai_assignment_draft','name_ai_chat','record_app_open','get_weekly_engagement_okr','reserve_ai_time_suggestion','remove_saved_assignment'];
const lines=["-- PRE-LAUNCH ONLY. OAuth must remain disabled and the hook unconfigured.",
 '-- Refuses to remove saved sessions or authorizations. Never use after launch.',
 "do $$ begin if exists(select 1 from public.study_sessions) or exists(select 1 from public.student_agent_grants) then raise exception 'Recovery refused: saved MCP data exists'; end if; end $$;",
 "do $$ declare f record; begin for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'student_mcp_%' or p.proname like 'student_agent_%' or p.proname like 'student_sessions_%') loop execute 'drop function '||f.sig; end loop; end $$;"
];
for(const name of moved){
 const f=snapshot.functions.find(f=>f.name===name&&f.schema==='public');
 if(!f)throw Error('Snapshot lacks '+name);
 const args=f.signature.slice(f.signature.indexOf('('));
 const core=name+(name==='create_saved_assignment'?'_core':'_browser_core');
 lines.push(`drop function public.${name}${args};`, `alter function private.${core}${args} rename to ${name};`, `alter function private.${name}${args} set schema public;`);
}
lines.push('alter function private.valid_priority_rules(jsonb) set schema public;');
for(const f of snapshot.functions){
 lines.push(`revoke execute on function public.${f.signature} from public,anon,authenticated;`);
 for(const acl of f.acl||[]){
  const match=acl.match(/^([^=]*)=([^/]+)\//);
  if(!match)throw Error('Unsupported ACL');
  const role=match[1]||'PUBLIC';
  if(['PUBLIC','anon','authenticated'].includes(role)&&match[2].includes('X'))lines.push(`grant execute on function public.${f.signature} to ${role==='PUBLIC'?'PUBLIC':ident(role)}${match[2].includes('X*')?' with grant option':''};`);
 }
}
lines.push("do $$ declare p record; begin for p in select schemaname,tablename,policyname from pg_policies where policyname='student_agent_no_oauth' and schemaname in ('public','storage') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop; end $$;",
 "do $$ declare f record; begin for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' loop execute 'drop function '||f.sig; end loop; end $$;",
 'drop table public.study_sessions,public.student_agent_grants,public.student_agent_rate_limits,public.student_agent_runtime_config;',
 'drop schema private;');
if(!snapshot.extensions.some(e=>e.name==='btree_gist'))lines.push('drop extension btree_gist;');
if(!snapshot.schemas.find(s=>s.name==='public').acl.some(a=>a.startsWith('supabase_auth_admin=')))lines.push('revoke usage on schema public from supabase_auth_admin;');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
for(const f of snapshot.functions){
 const hash=crypto.createHash('md5').update(f.definition).digest('hex');
 const acl=(f.acl||[]).slice().sort();
 lines.push(`do $$ begin if md5(pg_get_functiondef('public.${f.signature}'::regprocedure))<>${literal(hash)} then raise exception 'Recovered function differs: ${f.name}'; end if; if (select array_agg(x order by x) from pg_proc p cross join unnest(p.proacl::text[]) x where p.oid='public.${f.signature}'::regprocedure) is distinct from array[${acl.map(literal).join(',')}]::text[] then raise exception 'Recovered ACL differs: ${f.name}'; end if; end $$;`);
}
lines.push("select 'Pre-launch recovery completed' as result;");
fs.writeFileSync(path.resolve(outputPath),lines.join('\n')+'\n');
console.log('Generated pre-launch recovery SQL from hosted snapshot.');
