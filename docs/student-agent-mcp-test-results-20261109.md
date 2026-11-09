# Student agent connection tests — November 9, 2026

Status: Codex and protocol acceptance passed; SDK compatibility corrections verified and prepared for publication. Claude testing is deferred by the user. Canvas OAuth is separate and remains pending school approval.

## Completed in this run

- All 15 root CommonJS app test suites passed, including assignment creation/completion, settings, lists, priorities, chat, study sessions, pull-to-refresh, consent, and the ten-tool MCP contract.
- The separate mocked chat-backend suite passed using Node's TypeScript stripping. Its simulated provider failures are expected tests, not live provider outages.
- A disposable PostgreSQL 18 test database passed serial security checks, populated two-owner isolation, direct-table/Storage/old-RPC bypass denials, idempotency, stale updates, session overlap/concurrency, shared quotas, revocation, uncertain-consent cleanup, browser regressions, and the concurrent three-agent cap. The generated database was removed and its loopback-only server stopped afterward.
- The hosted acceptance SQL in `tools/mcp-hosted-acceptance.sql` passed inside a transaction ending in ROLLBACK. Only synthetic users/tasks were used. This checks actual hosted permissions and RPC behavior, not the OAuth token issuance path.
- Public hosted checks passed: authorization metadata 200, resource metadata 200, consent page 200, anonymous requests 401, malformed credentials 401, unapproved Origin 403, oversized body 413. The oversized-body check initially timed out and passed on one retry.
- Authorization discovery exposes no public registration endpoint, consistent with the decision to keep public dynamic client registration disabled.

## Real connection acceptance

- The actual Codex CLI completed registered-client OAuth, and Codex discovered all ten hosted MCP tools. Calls ran through the connected `canvas-todo` tools, rather than simulated database claims.
- A newly created disposable Auth account contained only synthetic data. Ordinary email/password sign-in produced the expected ordinary-app audience. No personal accounts or student coursework were used.
- Codex created task 35, retried the same request without duplication, marked it complete, and received CONFLICT for a stale prior-state change. The hosted app displayed the saved title, description, deadline, duration, and completed state.
- Codex created, rescheduled, listed, and cancelled a study session. The actual app calendar displayed its rescheduled 11:00–11:30 AM Mountain time. Cancellation removed it from active queries while preserving the cancelled history result. An absent assignment returned NOT_FOUND.
- An isolated loopback PKCE client using the existing registered Codex client performed a real authorization-code exchange and refresh-token exchange. It verified the synthetic owner ID, issuer-bound resource audience, client ID, initialize, ten-tool discovery, and reads with the refreshed token.
- The refreshed delegated token returned no rows through the direct assignments table API.
- Browser confirmation dialogs stalled the UI driver. The final disconnect was therefore tested by executing the actual `disconnectAgent` function from `index.html`, using the current official Supabase SDK against the live service, with only `confirm()` and DOM feedback simulated. Both app grants and provider grants were verified empty. This is real backend acceptance, not a completed click-through of the confirmation dialog.
- After disconnect, the previously issued refreshed access token returned ACCESS_REVOKED and its refresh token was denied. The actual Codex connection also returned ACCESS_REVOKED. Reloaded app Settings displayed “No connected agents.”
- The synthetic account was signed out and deleted. Its assignments, sessions, grants, rate counters, lists, and settings were verified absent. Its private local credential file and Codex OAuth credentials were removed. No production settings, public registration setting, or school Canvas integration was changed.

## Bugs found and corrections

The published consent page used `getUserGrants()`, while the actual Supabase SDK exposes `listGrants()`. Actual grant rows nest client identity under `client.id` and `client.name`; the earlier mock flattened them. Provider revocation requires `{clientId}`, rather than a string. These mismatches affected returning authorization and provider cleanup. All three were corrected; regression cases now use the real nested response and enforce the options-object signature. The local corrected consent page completed returning authorization against the real hosted Auth service.

The team's latest main branch was merged before release. Its priorities test also failed on unchanged main because the fake DOM omitted `style` and `parentElement`; those fixture fields were added without changing application behavior.

The refresh harness initially treated Chrome's automatic favicon request as another OAuth callback. It was corrected to ignore unrelated paths; the final complete refresh/disconnect run passed. The earlier attempts are not counted as completed acceptance runs.

## Remaining boundary

Claude was signed out and the user chose “Finish without the Claude test.” Its manual registration remains configured, but no Claude OAuth or tool execution is claimed. The native disconnect confirmation dialog itself still needs a manual click-through if UI-specific acceptance is required; the function, real SDK calls, both revocations, and subsequent denial have been verified.

Screenshots: `student-agent-mcp-live-tests-20261109/task-persisted.png`, `session-persisted.png`, and `disconnected.png`. All show synthetic test data. No approval-follow-up email was sent.
