# Student MCP connection guide

## Current status

November 9 update: PR #24 is merged, the consent page is published, the MCP migration and Edge Functions are deployed, and the hosted token hook/OAuth server are enabled. Public dynamic client registration remains **disabled by the product owner's decision**. Actual Codex sign-in, tool operations, token renewal, persistence, and denial after disconnect passed with a disposable account. Returning-consent and provider-revocation SDK mismatches were corrected locally after those tests. See [the current acceptance report](student-agent-mcp-test-results-20261109.md) for the release status and exact evidence. Claude testing is deferred by the user.

The follow-up migration `202611060002_agent_connection_limits.sql` enforces a default maximum of **three active agent connections per account**. Reapproval of an active client uses no extra slot; revocation frees one; reactivating a revoked client needs an available slot. A per-owner database lock enforces this limit even under concurrent approvals.

Extra slots require a project database administrator to insert or update `public.student_agent_connection_limits` with the account UUID, approved limit, and a nonempty approval reason. The table records approver and approval time and grants no access to ordinary users, OAuth agents, or the service-role Data API. Do not distribute a privileged database key as an override mechanism.

Student identity will come from the separate Canvas OAuth integration, using a verified Canvas origin/user ID as the unique account identity. No additional BYU email-domain or separate school-login restriction was added. Canvas identity login remains pending the Canvas integration; the existing app login is used for private acceptance testing.

The hosted migration and two-owner behavior checks passed in rollback-only transactions. The older release-review and manager-review documents describe earlier checkpoints; their pre-deployment status paragraphs are historical, not the current live status.

Live MCP URL:

```text
https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp
```

Do not paste an access token, refresh token, password, or API key into an agent chat or configuration. Manual client registration does not itself authorize an account; each account must approve its agent.

## Edge Function runtime configuration

Before a reviewed deployment, configure these values in the Edge Function runtime; do not commit credentials or a JWKS document to this repository:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<project publishable key>
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
MCP_RESOURCE_URL=https://<project-ref>.supabase.co/functions/v1/student-mcp
MCP_AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1
```

The hosted platform provisions its SDK key/JWKS settings automatically. The example above is for a manually configured runtime; do not copy secret keys into browser configuration. Keep the resource and issuer byte-for-byte aligned with `public.student_agent_runtime_config` and the access-token hook. Real hosted authenticated calls passed with the deployed runtime configuration.

## What approval allows

The consent page displays the requesting OAuth client and the fixed permission bundle. Approved clients can:

- Read your saved assignments and descriptions, lists, and priority rules.
- Create an assignment in this app and change its completion state.
- Read, create, reschedule, and cancel saved study sessions.

Agents cannot submit work to Canvas, read Canvas, sync with Canvas, change assignment due dates, delete assignments, edit lists or priority rules, access AI assistant history, or run arbitrary SQL. Study-session times are separate from assignment due dates. Database checks enforce the same allowlist below the MCP endpoint.

## Connect Claude

Claude's individually registered public client ID is `36def8b6-bb91-4f7f-93ac-1543fbc4caf6`, with callback `https://claude.ai/api/mcp/auth_callback`. Public registration is intentionally disabled. Use the connector's client-ID setting if supported; do not enable public registration or invent a client secret. Actual Claude client acceptance remains pending.

1. In Claude or Claude Desktop, open **Settings → Connectors → Add custom connector**.
2. Enter a name such as **Canvas To-Do Prioritizer** and paste the target MCP URL above.
3. Choose **Add**, then **Connect**.
4. Sign in on the app consent page and review the requesting client and permissions.
5. Select **Allow access** only if the request is expected. Claude never receives your app password.
6. Open **Search and tools** in a chat to enable the connector. Review tool requests before allowing changes.

Claude’s custom remote connectors use OAuth and support Streamable HTTP. Details can change by plan and app version; check Anthropic’s [remote connector setup](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) and [remote MCP guidance](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp).

## Connect Codex

Codex uses the individually registered public client `374c1f93-8709-4db7-a145-1adb540fc3a5`. The existing local configuration includes its exact registered loopback callback on port 4188. With that configuration already installed, start OAuth through the host’s browser flow:

```sh
codex mcp login canvas-todo
codex mcp list
```

For Codex IDE, open the gear menu, choose **MCP servers → Add server**, select **Streamable HTTP**, enter the same URL, save, restart the extension, then choose **Authenticate**. The Codex CLI and IDE share configured MCP servers. See the current [Codex MCP instructions](https://developers.openai.com/codex/mcp/).

Do not use a pasted bearer token. Codex should use the MCP OAuth login and store OAuth credentials in its own credential store. If the OAuth flow fails, do not work around it by copying a token into `config.toml`.

## Disconnect an agent

In the app, sign in and open **Settings → Connected agents → Disconnect**. The app revokes its owner/client authorization row first, which makes every MCP tool reject that client immediately. It also asks Supabase Auth to revoke the OAuth grant and refresh tokens. If the Auth revoke fails, the app row still blocks tool access; the UI reports the partial result. You can also remove the connector in the agent’s settings.

## Local preview

`oauth-consent.html` is the configured local consent route. The local Supabase Auth stack must be running with `[auth.oauth_server] enabled = true`, and the app preview must use `http://127.0.0.1:4183` so that the Auth redirect returns to the consent page. These settings belong to `supabase/config.toml`; do not copy them to the hosted project without the production approval gate.

The app’s MCP endpoint is stateless Streamable HTTP and uses a fresh MCP server per request. The exact ten tool names are checked in `test-student-agent-mcp-contract.cjs`.

### Local PostgreSQL policy and migration checks

The independent native-database checks are reproducible with PostgreSQL 15 or later and a local `postgres` administrator connection. They use a synthetic pre-migration baseline, apply the repository migrations to one generated database on `127.0.0.1`, run the owner-isolation, bypass, rate-limit, concurrency, revoke, and browser-regression checks, then remove only that generated database. The runner has no host option and refuses to start without the explicit local-database flag. It never targets a hosted address.

On Windows with PostgreSQL 18 installed at the standard path, run:

```sh
node tests/local-student-agent-mcp/run.cjs --allow-loopback-test-database --port 55487 --psql "C:/Program Files/PostgreSQL/18/bin/psql.exe"
```

The server must already be running on that loopback port, and `psql` must be able to authenticate without prompting (for example, via a local password file). The fixture is a synthetic schema reconstruction, not a clone of a current Supabase project; a pass does not verify hosted roles/extensions, Auth OAuth, Edge runtime, or production data. The runner deletes only its own generated `mcp_local_<random>` database on completion. It does not drop the reviewer's separate scratch database.

## Release gate and evidence

Before a production release, complete all items in [the security review](student-agent-mcp-security.md), run the migration and policy acceptance checks against a local Supabase database, and record results in [the evidence log](student-agent-mcp-evidence.md). Then get the separate production authorization before applying a production migration, enabling hosted OAuth, configuring a live OAuth hook, or deploying the function.

Codex and protocol-level live acceptance are recorded in the November 9 report. Claude remains untested. Test-account credentials were removed after acceptance, so a real student connection still requires that student's own approval. The planned Canvas identity login is a separate integration and is not available yet.
