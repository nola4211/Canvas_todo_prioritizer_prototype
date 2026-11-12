-- Newer draft-table migrations run after the MCP policy audit. Restore the
-- same restrictive OAuth boundary while leaving the owner policy intact.
begin;
create policy student_agent_no_oauth on public.assignments_draft as restrictive for all to authenticated
  using (not coalesce((auth.jwt() ? 'client_id'),false))
  with check (not coalesce((auth.jwt() ? 'client_id'),false));
commit;
