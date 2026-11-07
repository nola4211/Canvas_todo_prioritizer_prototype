# Hosted MCP release review — November 6, 2026

Status: implementation and hosted rollback-only preflight passed. Release awaits confirmation; real client acceptance remains outstanding.

## Work verified this session

- Inspected the actual `canvas_prioritizer` hosted schema and saved a schema/ACL snapshot outside the repository. No student rows, passwords, tokens, or service keys were exported.
- Found and fixed a hosted-only migration failure: the project role cannot create policies on managed `storage.buckets_vectors`. RLS-enabled Storage tables without any applicable permissive policy already deny authenticated access and are left unchanged. Tables with an applicable permissive policy must receive the delegated-token restriction or the migration aborts. Future Storage permissions require the same review before being added.
- Executed the complete MCP migration against the hosted schema inside a transaction ending in ROLLBACK.
- Tested synthetic accounts A and B in that transaction: ordinary-browser assignment creation and consent; owner reads; foreign/missing assignment denials; list reads; direct assignment/chat/Storage denials; browser-only RPC and private-helper denials; completion changes; study-session creation/cancellation; revocation blocking subsequent reads. No existing student's records were used.
- Exercised hook claim transformations and checked required Auth-role privileges. The project role cannot impersonate `supabase_auth_admin`; actual provider invocation remains part of post-enablement acceptance.
- Verified after rollback that the new MCP tables and private schema did not remain.
- Generated a pre-launch recovery script from the actual hosted snapshot. Rehearsed migration plus recovery and verified all 16 original function definitions and ACLs match the snapshot. This script refuses to discard saved sessions or authorization grants and must not be used after launch. The post-launch disable runbook remains the safe shutdown procedure.
- Reran the full isolated PostgreSQL suite: owner isolation, retries, stale updates, concurrency, shared quotas, uncertain-consent cleanup, and ordinary-browser regressions passed; the test database was removed and its disposable server stopped.
- Fetched team main at `d53f42e` and reconciled its assignment editing, priority picker, and contrast changes into the local files without a Git history merge or push. Kept the approved design and refresh changes. Renamed the unapplied MCP migration to `202611060001_student_agent_mcp.sql` to avoid colliding with the team's `202611050001_assignment_editing.sql` version.
- Local functional checks: 13/14 suites passed. The only failure remains the previously reproduced estimator fixture expectation, `75m` versus `90m`. Completion, pull refresh, consent, MCP contract, sessions, lists, priorities, chat, and assignment creation suites passed.

## Current hosted settings observed

- Project: `uowlwdwrqceklbqjcnmc` / `canvas_prioritizer`.
- OAuth Server: disabled.
- Auth hooks: none configured.
- Site URL: `http://localhost:3000`; no redirect allowlist entries.
- Public signing keys: ES256 is available.
- No MCP migration was committed to the hosted database; no function deployed; no GitHub push or merge.

## Concrete release actions requiring confirmation

1. Publish the reviewed MCP/consent/app files and approved design changes while preserving the latest team work; push and merge the release branch so GitHub Pages serves the consent page and Connected agents controls.
2. Apply only the reviewed MCP migration to the existing hosted schema (check separately whether the team's editing grant migration is already applied). Do not replay the repository's historical migrations against production.
3. Deploy `student-mcp` and the delegated-token guard in `study-assistant`. Install the runtime values listed in `student-agent-mcp-setup.md`; use the existing browser-safe publishable key, never a service-role key for MCP operations.
4. Set the hosted sign-in/consent configuration so the resolved consent URL is exactly `https://nola4211.github.io/Canvas_todo_prioritizer_prototype/oauth-consent.html`. Verify how the dashboard combines its Site URL and authorization path before saving. Do not copy the localhost-only CLI configuration wholesale.
5. Configure `public.student_mcp_access_token_hook`, enable the Supabase OAuth server and dynamic client registration, and verify metadata. Each student must still sign in and explicitly approve an individual agent before app access is granted.
6. Connect a private account from Codex and Claude through real OAuth. Verify discovery, exactly ten tools, safe synthetic read/create/complete/schedule/cancel operations, app persistence, refresh, regular browser sign-in, and immediate denial after disconnect. Keep the feature marked incomplete until these checks finish.

These changes let an explicitly approved agent read that student's saved task descriptions and grade weights, create tasks, change completion, and manage study sessions. They do not authorize Canvas access, assignment submission, task deletion, changing due dates, or access to chat history. Canvas/BYU OAuth approval remains independent.

## Evidence and repeatable assets

- `tools/mcp-hosted-snapshot.sql`: read-only metadata snapshot query.
- `tools/mcp-hosted-acceptance.sql`: synthetic checks appended inside a rollback-only migration transaction.
- `tools/build-mcp-recovery.cjs`: snapshot-based pre-launch recovery generator.
- `student-agent-mcp-release-screenshots/hosted-rehearsal.png`: actual hosted acceptance result.
- `student-agent-mcp-release-screenshots/oauth-before-enablement.png`: actual disabled OAuth setting before release.
- Complete pre-release metadata and generated recovery SQL are outside the repository in the adjacent `mcp-hosted-release-20261106` folder.

References: [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).
