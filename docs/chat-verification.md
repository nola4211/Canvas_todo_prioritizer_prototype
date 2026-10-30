# AI assistant verification — October 30, 2026

## Completed

- Inspected the live `chat` and `message` schema, foreign keys, identity columns, permissions, and row counts before migration. Both tables were empty.
- Applied `202610300001_ai_chat.sql` to project `uowlwdwrqceklbqjcnmc` successfully.
- Deployed `study-assistant` with JWT verification enabled. The existing `canvas-preview` function was left alone.
- Live `docs/verify-chat.sql` returned PASS: owner reads, other-account privacy, direct browser write denial, service-only reply finalization, concurrent-request lock, atomic saving, cached retry, and no duplicate messages. Its writes rolled back.
- In the signed-in local preview, created a conversation and sent a question about saved assignments. The request reached OpenAI. OpenAI returned HTTP 429 with code `credit_balance_exhausted`.
- The app showed an error, kept the draft, enabled retry, and did not display a made-up answer. Retrying used the same request ID. No credentials were printed or placed in frontend files.
- Refreshing and reopening the local preview reloaded the saved failed question and its retry control. A second conversation started empty, with the first still available in the selector.
- Automated checks passed: `test.cjs`, `test-lists.cjs`, `test-priorities.cjs`, `test-local-assignments.cjs`, `test-chat.cjs`, and `test-chat-backend.mjs`.
- Backend simulation checks cover caller-token database reads, service-only finalization, real-shaped Responses API output, history order, context, authentication failures, invalid input, CORS, missing configuration, cached replies, usage limits, quota errors, provider failure, and database save failure.
- Frontend simulation checks cover new chats, reloading history, separate conversations, plain-text output, retained failed drafts, retry ID reuse, and clearing on sign-out.

## Funded live verification completed

After the key owner added API credits:

- Retried the same saved question successfully. The assistant named the three real demo assignments and correctly prioritized Chapter Readings according to the settings title rule.
- Asked a follow-up about the recommended assignment without repeating its name. The assistant identified Chapter Readings, its 5% weight and 30-minute estimate correctly.
- Asked it to mark the assignment complete. It said it could not do so; assignments remained unchanged.
- Refreshed and reopened Assistant. Both user questions and both actual AI replies reloaded from Supabase.
- Read-only database confirmation returned 2 conversations, 4 messages, 0 unfinished messages, and all three assignments still incomplete. The two earlier failed API attempts did not duplicate the saved user question.
- The separate empty conversation remained available in the selector.

Separate-account privacy was tested with actual database RLS under another Auth subject, rather than signing into a second browser account. No other student's real data was used. The frontend is verified in the local preview; GitHub Pages needs the frontend change merged/deployed.
