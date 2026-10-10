-- Read-only current-schema audit. Displays counts/metadata, never record contents.
begin read only;
do $audit$
declare item record; total bigint; result jsonb := '[]'::jsonb;
begin
  for item in select c.relname,c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname
  loop
    execute format('select count(*) from public.%I',item.relname) into total;
    result := result || jsonb_build_array(jsonb_build_object(
      'table_name',item.relname,'row_count',total,'rls_enabled',item.relrowsecurity));
  end loop;
  perform set_config('module05.audit_snapshot',result::text,true);
end $audit$;
select table_name,row_count,rls_enabled
from jsonb_to_recordset(current_setting('module05.audit_snapshot')::jsonb)
  as snapshot(table_name text,row_count bigint,rls_enabled boolean);
rollback;
