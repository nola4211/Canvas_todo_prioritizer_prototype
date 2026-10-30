# AI assignment creation verification — October 30, 2026

## Database and automated checks

- Inspected the current assignment columns and existing assignment/chat/message policies before changes. Owner, optional, and creation-request columns existed; class label and chat draft columns did not.
- Applied migration `202610300003_ai_assignment_creation.sql` successfully to `uowlwdwrqceklbqjcnmc`. It adds class labels, saved drafts, and the common creation/review functions while preserving the teammate's policies and existing rows.
- `docs/verify-ai-assignment-creation.sql` returned PASS on the live database for shared creation, confirmed retry identity, changed-input rejection, incomplete/stale review rejection, edit/cancel, validation, and account privacy. All test writes rolled back.
- Applied `202610300004_friendly_assignment_messages.sql` for the requested user-facing wording. It changes future acknowledgements without rewriting conversation records.
- All eight automated suites passed: completion, lists, priorities, manual assignment adapter, manual/import UI, chat UI, chat draft confirmation UI, and chat backend/draft validation.
- Added a regression check that holds an AI request open and verifies that Thinking is visible while retry/failure controls are hidden. Retry still appears after an actual failed request.

## Live signed-in browser check

1. Created a new conversation and asked to add “AI verification reading” with no other details. The assistant asked for the missing class, due date, time/permission, optional status, and grade weight. There was no Create button.
2. Supplied History, November 6, 2026, not optional, and explicit unknown grade weight, with an instruction not to guess the time. Only the time/permission question remained. Grade weight displayed Unknown.
3. Refreshed and reopened Assistant. The partial answers and unanswered time were restored.
4. Granted permission to estimate time. The assistant proposed 30 minutes, labeled AI estimate, and displayed all six review fields.
5. Chose Edit details, then changed the title to “AI verification reading revised” and supplied 40 minutes. A new review retained the other answers and used the student's time.
6. A read-only database count before confirmation found zero assignments with the verification title prefix. Conversation alone had not created a row.
7. Refreshed with the review ready. The same reviewed fields reloaded. Selected Create assignment once; the task appeared after confirmed saving.
8. Database readback found assignment ID 10 with the revised name, History class label, November 6 Denver due date, 00:40:00 estimate, null grade weight, optional=false, and exactly one row for its save request ID.
9. Refreshed after saving. The assignment reloaded from Supabase and appeared under History in By Class. The class-heading regression test also checks escaping a class label containing markup.
10. Checked the revised client-facing messages: successful creation displays “Assignment successfully saved!” once, without the database explanation. While a real follow-up was loading, Thinking appeared without an error/retry message. An earlier system-generated acknowledgement is displayed with the new friendly wording without changing its stored record.

The synthetic verification assignment remains in the shared account so the user can inspect the result. Other tasks, including changes made concurrently by the user/team, were preserved. No existing assignment was renamed, deleted, or completed as part of this check.

Manual and AI paths share the same database writer. A separate browser-created manual task with a known grade weight and the final AI assignment's list/completion interactions were covered by automated/database checks rather than additional persistent browser test data. Class names are labels, not verified Class-table links or Canvas course data.

## Deployment status

The database migrations and updated Edge Function are deployed with JWT verification enabled. The local preview at http://127.0.0.1:4183 includes the frontend changes. GitHub Pages requires the frontend pull request to be merged/deployed. Do not rerun applied migrations.
