# Student MCP implementation evidence

Prepared November 5, 2026. This records local source/test evidence only; it is not a deployment or hosted OAuth acceptance record.

## Local branch and change boundary

- Branch: `codex/student-agent-mcp`
- Base: `1d3659efbc87639f12d85f552ad50e0dc3951b68`
- Hosted Supabase database, Auth OAuth setting, function, GitHub remote, and branch were not changed by this work.
- No GitHub push, merge, production migration, config push, deployment, or remote OAuth client creation occurred.

## Checks that ran

- `deno check --config deno.json --lock=deno.lock index.ts` — passed with Deno 2.9.6 and the local pinned lockfile. Transport, authentication, tool schemas, database calls, response formatting, and tool registration now live in separate modules under `supabase/functions/student-mcp/`.
- `deno lint --config deno.json index.ts auth.ts schemas.ts database.ts responses.ts tools.ts` — passed.
- `node test-study-sessions.cjs` — passed DST gap and overlap conversion, 23/25-hour day windows, cross-midnight overlap, exact 11:59 PM Denver due-time conversion, session query mapping, create/reschedule/cancel RPC dispatch, and agent grant adapter behavior.
- `node test-student-agent-mcp-contract.cjs` — passed source contract checks for exactly ten tools, OAuth claim binding, protected resource middleware, direct table/view/Storage denial policies, private schema, public RPC revocation allowlist, rate caps, exact due-time boundary, and assistant denial ordering.
- `node test-student-agent-oauth-consent.cjs` — passed mocked local consent allow/deny, provider-first approval, preservation of existing app grants after provider errors, lost-response readback, owner-scoped client cleanup, and honest cleanup-failure messaging. This test does not run Supabase OAuth, PKCE, or DCR.
- The reviewer independently ran the guarded harness in [`tests/local-student-agent-mcp/`](../tests/local-student-agent-mcp/) against a separate native PostgreSQL 18.6 cluster. All repository migrations applied to its synthetic baseline; all four database stages passed and its generated database was removed. Detailed scope, limits, and results are recorded in the [independent implementation review](student-agent-mcp-manager-review.md).
- `node test-time-suggestion.cjs` — passed regular app-token AI suggestions and verifies an OAuth client is rejected before AI quota reservation or assistant-history work.
- All other existing `test-*.cjs` suites passed except the pre-existing `test-local-assignments.cjs` failure below.
- `node test.cjs` — passed the repository's UI behavior simulation and inline-script syntax check.
- `node --check` passed for the session module, new tests, and local preview/capture helpers.
- Phone-width study-session fields stack vertically; the responsive fixture now checks visible child overflow as well as page width.
- `node tools/capture-mcp-screenshots.cjs 4193` — captured 20 synthetic screenshots across assignments, calendar, session editor, connected agents, and consent at 1366×768, 1024×768, 768×1024, and 390×844; all captured viewports report no horizontal overflow. See [`docs/student-agent-mcp-screenshots/`](student-agent-mcp-screenshots/).

## Existing unrelated test failure

`test-local-assignments.cjs` fails at its AI estimate assertion: the fixture leaves `cdescription` empty but calls `requestTimeSuggestion('Lab report', ...)`, while the app correctly discards a suggestion whose captured description no longer matches the current description field. The assertion expects `90m` but the displayed estimate remains `75m`. This failure was present before the MCP changes and was not altered as part of this task.

## Acceptance still blocked

- The hosted OAuth discovery endpoint returned `feature_disabled`; the hosted OAuth server remains disabled.
- The PostgreSQL run used a synthetic reconstruction of the pre-MCP tables, not a complete local Supabase reset or a clone of the hosted schema. The migration and SQL acceptance file remain unverified against the complete Supabase-managed schema and roles.
- The local Deno check used a temporary `npm exec` package runner; Deno is not installed globally.
- Claude and Codex OAuth were not connected. There is no hosted initialize/tool-call/revocation trace or database readback.
- Hosted consent/client screenshots remain outstanding. The local synthetic screenshots are layout evidence only and are not presented as real OAuth evidence.
- `docs/verify-student-agent-mcp.sql` is prepared for a disposable local Supabase database. It is intentionally unrun here.

Hosted OAuth discovery, actual Claude/Codex sign-in, initialize/tool calls, revocation, database readback, Edge runtime configuration, and hosted consent/client screenshots remain unverified. Do not mark the hosted connection released until complete local Supabase and hosted client acceptance have actual recorded results and the security review and production authorization are complete. No production migration, OAuth enablement, function deployment, GitHub push, or merge was performed.
