# Recording and submission checklist

The signed-in local app is running at http://127.0.0.1:4182/. All three synthetic assignments are incomplete, ready for the recording. Cameron authorized publishing the reviewed source changes. No video or Canvas submission has been made.

## Verification completed

- [x] Rechecked the changed schema and preserved teammate work.
- [x] Applied the approved synthetic rows and assignment access policies.
- [x] Passed the real PostgreSQL role/claim access checks; test updates rolled back.
- [x] Confirmed the exact demo account's email with Cameron's approval and signed in.
- [x] Loaded three synthetic assignments from Supabase.
- [x] Completed Demo: IS401 Exam (ID 1) and verified its database value.
- [x] Refreshed the page and confirmed it remained checked.
- [x] Unchecked, refreshed, and confirmed it remained incomplete; IDs 2 and 3 stayed unchanged.
- [x] Opened a fresh tab sharing the existing login and confirmed loaded state.
- [x] Verified rapid double-click behavior and checked the normal browser console.
- [x] Tested a stale save using two browser tabs; the error preserved the displayed value, and reload reconciled it.
- [x] Saved browser/database evidence and updated README with actual results.

See [live verification](live-verification.md) for the evidence and limits. The repeated-click adapter call count, failed network request, and held-request locks are covered by simulated tests; no live offline or slow-network test is claimed.

## Team/database follow-up

- [ ] Review new chat and message tables with the team. Both were empty with row access controls disabled at the last audit.
- [ ] Add appropriate synthetic sample rows to those tables and review their access before submission.
- [ ] Reconcile Nolan's ERD with the current database entities and assignment relationships.

The last audit found three rows each in Class, Class_User, assignments, user, and user_assignment, with row access controls enabled. The earlier chat_history table was absent. Existing teammate work was preserved. table-status.sql is a read-only table/count/access audit.

finish-demo.sql and confirm-demo-email.sql record applied, one-time operations; do not rerun them. demo-access-review.sql and check-demo-auth.sql are unexecuted drafts. The administrator stale-save-setup.sql and stale-save-reset.sql are unexecuted alternatives; the actual stale-save test used the frontend in two tabs.

## Recording and submission

- [ ] Record the README's 60–90 second script: incomplete card → click → confirmed completed card → refresh → still completed → uncheck.
- [ ] Keep credentials out of view and the video under two minutes.
- [ ] Verify the deployed site after the authorized source push.
- [ ] Upload the video and verify its actual link.
- [ ] Submit one team Canvas text entry with the actual video link and repository/README link. Submission is not yet authorized.

Repository: https://github.com/nola4211/Canvas_todo_prioritizer_prototype

Assignment: https://byu.instructure.com/courses/35967/assignments/1368736
