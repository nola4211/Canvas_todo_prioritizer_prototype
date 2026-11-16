const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202611160001_ai_flexible_assignment_drafts.sql','utf8');
const edge=fs.readFileSync('supabase/functions/study-assistant/index.ts','utf8');
const chat=fs.readFileSync('chat.js','utf8');
const backend=fs.readFileSync('backend.js','utf8');
const confirmSql=fs.readFileSync('supabase/migrations/202611160002_ai_chat_assignment_confirmation.sql','utf8');

assert.match(sql,/name is not null[\s\S]*class_name is not null[\s\S]*priority is not null/);
assert.doesNotMatch(sql,/assignment_created_fields[\s\S]{0,500}due_date is not null/);
assert.match(sql,/on conflict\(owner_id,source_chat_id\)[\s\S]*do update/);
assert.match(sql,/delete from public\.assignments_draft[\s\S]*source_chat_id=p_chat_id/g);
assert.match(sql,/Add a name, class, and priority before creating the assignment/);
assert.match(sql,/grant execute on function public\.finish_ai_turn[\s\S]*service_role/);
assert.match(edge,/priority:\{type:\['integer','null'\]\}/);
assert.match(edge,/only details required to create an assignment are its name, class, and priority/i);
assert.match(chat,/Saved in Drafts/);
assert.match(backend,/select\(selected\)[\s\S]*assignments_draft/);
assert.match(backend,/p_priority:fields\.p/);
assert.match(edge,/wantsAssignmentConfirmation/);
assert.match(edge,/confirm_ai_assignment_from_chat/);
assert.match(confirmSql,/grant execute on function public\.confirm_ai_assignment_from_chat[\s\S]*service_role/);
assert.doesNotMatch(confirmSql,/to authenticated/);

console.log('PASS: minimal AI creation, automatic Drafts mirroring, cleanup, priority persistence, and service-only finalization contract.');
