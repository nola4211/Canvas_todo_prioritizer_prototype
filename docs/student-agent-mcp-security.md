# Student MCP security review

## Status and boundary

This is a source review of the local implementation. The migration, Auth OAuth settings, and Edge Function have not been applied to the hosted project. The hosted OAuth server is currently disabled. Do not deploy this design until the open items below have been reviewed against the actual local Supabase stack and approved for production.

The MCP endpoint is a dedicated user-scoped interface to the saved app database. It is not a Canvas integration and contains no Canvas API URL, credential, or client.

## Authentication and authorization

- `student-mcp` is configured with gateway JWT verification disabled only so that OAuth discovery can be served. The first middleware serves the RFC 9728 Protected Resource document; the next verifies a user token through Supabase Auth/JWKS and creates the user-scoped Supabase client.
- The handler independently requires `sub`, `iss`, unexpired `exp`, `role=authenticated`, a nonempty verified `client_id`, and an `aud` exactly equal to the configured MCP resource URL. The URL and issuer are also checked again in `private.student_mcp_preflight`.
- Supabase Auth's custom access-token hook sets the OAuth token audience to the canonical MCP resource. Ordinary app sign-ins do not gain an OAuth client claim.
- The consent page stores an owner/client grant only after the user signs in and explicitly approves the displayed client. The database stores one fixed capability bundle; callers cannot request extra capabilities.
- Every MCP RPC checks the active owner/client grant before accessing data. Revoke first marks the app grant inactive; every later tool call fails even if an OAuth access token remains unexpired. The app then requests Supabase Auth grant and refresh-token revocation.
- Every browser wrapper around a prior public RPC checks for a regular app session and rejects tokens with a `client_id` claim. This prevents a delegated OAuth token from reaching chat, assignment deletion, activity tracking, or other old browser RPC behavior.

## Database boundary

- `private` is excluded from PostgREST exposed schemas. Only `private.valid_priority_rules` receives authenticated execution because existing check constraints call it; other private helpers have authenticated/public execution revoked.
- A restrictive RLS policy denies OAuth-client tokens direct access to every public/storage table or partition with authenticated privileges. Owner-executed public views with authenticated reads are switched to `security_invoker`; an authenticated-readable materialized view or table without RLS aborts the migration.
- MCP RPCs expose only the ten approved tools. A catalog pass revokes execution inherited through `PUBLIC` or granted to `anon`/`authenticated` from every current public function, then restores the explicit browser and MCP wrappers. A postcondition aborts if an unlisted authenticated public function remains executable.
- `study_sessions` is owner-readable and not directly writable. Writes use narrow, owner-checked functions. Database constraints enforce duration, idempotency, optimistic version checks, and no overlapping active sessions. Assignment due dates remain unchanged. App due dates are stored at 11:59 PM America/Denver; a session ending after that exact stored instant requires explicit opt-in.
- Rate limits are stored in Postgres and updated under an owner/minute transaction lock, shared across client applications: 60 tool calls/minute and 20 writes/minute per user. The 61st tool call and 21st write are rejected.

## MCP endpoint protections

- Input schemas are strict and reject extra fields. Assignment IDs are decimal strings, date-times must include offsets, ranges are limited to 93 days, and write calls use idempotency keys or expected versions.
- The body is capped at 64 KiB. CORS is an origin allowlist. Responses are `no-store`; logs contain only random request ID, tool name, safe status, and duration, not arguments or output.
- The MCP handler is stateless: it creates a new server per request and uses only Postgres for durable state.
- `study-assistant` verifies the bearer token with Auth, checks the verified token’s OAuth `client_id`, and denies delegated clients before reading the request body, chat history, reserving AI usage, or calling the model.

## Remaining review items before release

1. The repository migrations now pass against an isolated PostgreSQL 18.6 synthetic baseline. Still run them from a clean local Supabase reset against the complete schema and confirm every `ALTER FUNCTION`, grant, RLS policy, view, and extension succeeds; the synthetic fixture is not a substitute for Supabase-managed objects.
2. Verify Supabase Auth local OAuth PKCE + DCR and the custom access-token hook produce the expected issuer, audience, `client_id`, callback, and refresh behavior.
3. The isolated native checks now cover synthetic users A and B, direct table/view/Storage and old-RPC bypasses, MCP reads/writes, create/retry/conflict, session overlap and stale updates, revocation, and exact 60/20 shared limits. Repeat against the complete local Supabase reset and use database readback after create/update/cancel.
4. Verify the `student-mcp` middleware and SDK versions in the actual Supabase Edge runtime, including discovery metadata, Streamable HTTP initialize/list/call, malformed body, unauthenticated request, disallowed origin, and no session persistence.
5. Run actual Claude and Codex OAuth sign-in, discover exactly ten tools, complete a safe read and synthetic create/update/cancel test, revoke access in app Settings, confirm the next call is rejected, and save clean screenshots without tokens or personal data.
6. Review the custom access-token hook's production implications and confirm regular browser auth continues to work after the audience hook is installed.
7. Prepare and review a down migration against a copy of the pre-migration database before production use. Do not infer that rolling back tables alone restores the pre-migration RPC access grants.

## Disable runbook

If the feature must be shut off after a release, do the steps in this order through an authorized administrator session:

1. Revoke every active app grant so every MCP RPC denies immediately:

   ```sql
   update public.student_agent_grants
   set revoked_at = coalesce(revoked_at, statement_timestamp())
   where revoked_at is null;
   ```

2. Disable the Supabase Auth OAuth server to prevent new authorization and token refreshes.
3. Disable the Edge Function route through the reviewed deployment/configuration process.
4. Confirm an old access token receives `ACCESS_REVOKED` from the tool RPC and that new authorization discovery cannot proceed.

Keep the restrictive RLS policies and RPC allowlist active while the MCP endpoint is being disabled. Removing those database protections first could expose prior public RPC behavior to delegated tokens. A full rollback must wait for a reviewed down migration and a before/after ACL comparison.

No disable or rollback operation has been run as part of this task.
