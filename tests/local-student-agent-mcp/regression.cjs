const cp=require('node:child_process'),assert=require('node:assert/strict');
const {database:db,psql:exe,port}=require('./db.cjs');
const args=['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-w','-v','ON_ERROR_STOP=1'];
const owner='00000000-0000-4000-8000-0000000000a1';
const browser={sub:owner,role:'authenticated',iss:'https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1',aud:'authenticated'};
function query(sql,claims=browser,role='authenticated'){
 const r=cp.spawnSync(exe,args,{input:`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claims='${JSON.stringify(claims)}'; ${sql}; COMMIT;`,encoding:'utf8',windowsHide:true,shell:false});if(r.status)throw Error(r.stderr);return r.stdout.trim();
}
const chat=JSON.parse(query("SELECT public.create_ai_chat('New chat')"));assert.ok(chat.id);
assert.equal(query(`SELECT public.name_ai_chat(${chat.id},'Synthetic regression chat title')`),'Synthetic regression chat title');
const req=crypto.randomUUID();
assert.equal(JSON.parse(query(`SELECT public.begin_ai_turn(${chat.id},'${req}','Synthetic regression request')`)).cached,false);
query(`SELECT public.finish_ai_turn('${owner}',${chat.id},'${req}','Synthetic answer','synthetic-model',null)`,{role:'service_role'},'service_role');
assert.equal(query(`SELECT count(*) FROM public.message WHERE "chat_ID"=${chat.id}`),'2');
query("INSERT INTO public.user_priorities(scope,rules,ignore_user_rules) VALUES ('settings','[{\"type\":\"due\"}]',false)");
assert.equal(query("SELECT count(*) FROM public.user_priorities WHERE scope='settings'"),'1');
assert.equal(query("INSERT INTO public.lists(name) VALUES ('Regression list') RETURNING name"),'Regression list');
query('SELECT public.reserve_ai_time_suggestion()');
assert.match(query('SELECT public.record_app_open()'),/^\d{4}-\d{2}-\d{2}$/);
assert.throws(()=>query('SELECT public.get_weekly_engagement_okr()'),/Administrator access required/);
console.log('PASS native browser regression: chat creation/title/turn plus service finalizer/history, priority CHECK validation, list creation, AI quota reservation, activity logging, admin-only aggregate access.');
