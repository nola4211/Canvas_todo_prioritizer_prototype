# Independent MCP implementation review

November 5, 2026. Local implementation verified; hosted release is not complete.

## Corrections verified

- Replaced invalid column-level DELETE privilege checks with table privilege checks.
- Fixed the missing `page p` alias in the MCP saved-list query. This defect was found by executing the function against populated PostgreSQL data.
- Changed consent to complete provider approval without an automatic redirect before activating app permissions.
- Added owner-scoped, repeat-safe revocation by client ID for uncertain approval writes whose response was lost. Cleanup failures now report possible remaining access instead of claiming revocation succeeded.

## Independent executed checks

The manager initialized a separate native PostgreSQL 18.6 cluster on loopback port 55487. It did not use the existing PostgreSQL service or hosted Supabase. Its starting schema was reconstructed from repository evidence, with synthetic Auth users and claims; it was not a clone of the live schema or a complete Supabase stack.

The final repository command passed independently:

```text
node tests/local-student-agent-mcp/run.cjs --allow-loopback-test-database --port 55487
```

It created `mcp_local_5aa42d5afc8c778f`, applied every repository migration, passed all four test stages, and removed that database automatically.

Actual database checks covered owned reads, descriptions/weights, foreign/missing IDs, lists/memberships/priorities, direct table/view/Storage reads, direct assignment writes, old RPC and private-helper bypasses, assignment creation retries/conflicting payloads, completion retries/stale state, session retries/version checks/cancellation, concurrent overlaps, cross-midnight queries, deadline permission/warnings, revocation, owner-only uncertain-consent cleanup, and shared per-user quotas across clients.

Native browser regressions passed for chat creation/title/turn/history, the service-role finalizer, priority validation, list creation, AI usage reservation, activity logging, and rejection of a non-admin aggregate read.

Additional independent Deno tests exercised the actual MCP SDK with a mocked database: exactly ten tools, strict argument rejection, structured output, read/reschedule routing, and rejection of an attempted RPC-name override. A separate test used generated ES256 signing keys and inline synthetic JWKS against the actual authentication middleware: a valid OAuth identity was accepted; missing, expired, forged, wrong-issuer, wrong-resource, and ordinary app credentials were rejected. Neither test contacted hosted Auth.

The revised consent behavior suite and structural contract suite passed. The earlier full local run passed 13 suites with only the reproduced pre-existing estimator assertion (`75m` versus `90m`) failing.

## Checked source identity

SHA256 at this review checkpoint:

- Migration `202611050001_student_agent_mcp.sql`: `6ECE3553E3854374940BE55E60B0B7369F9520F62472D59724EFA5FAA046C869`
- Consent page `oauth-consent.html`: `3437CF9F2D12C89266D7B235CF846D58E1CE978D7AF90D5B971D97AD578B7D72`

Documentation-only follow-up does not invalidate these functional checks. Functional changes require relevant re-verification.

## External acceptance still required

The public hosted discovery endpoint was independently rechecked and returned `feature_disabled: OAuth server is disabled`. No hosted login, token issuance/refresh, callback, or Claude/Codex integration was performed. PostgREST audience acceptance and deployed Edge-runtime behavior remain unverified. Compare the actual hosted schema and access grants before applying migrations.

Do not mark the hosted connection released. Production OAuth configuration, migration application, backend/frontend deployment, and real client acceptance require the separately authorized release phase. No GitHub push, merge, or hosted modification occurred during this review.
