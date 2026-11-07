-- Read-only schema/permission snapshot. Contains no student rows or credentials.
select jsonb_build_object(
 'captured_at',now(),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'acl',c.relacl,'options',c.reloptions)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage') and c.relkind in ('r','p','v','m')),
 'columns',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',udt_name,'nullable',is_nullable,'default',column_default)) from information_schema.columns where table_schema in ('public','private','storage')),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('public','private','storage')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid))) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage')),
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'acl',nspacl)) from pg_namespace where nspname in ('public','private','storage')),
 'column_grants',(select jsonb_agg(to_jsonb(g)) from information_schema.column_privileges g where table_schema in ('public','private','storage')),
 'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace)
) as mcp_schema_snapshot;
