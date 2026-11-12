# Cameron sprint backlog review — November 12, 2026

Branch: `codex/cameron-sprint-backlog-20261112`, based on team main `fe0e649`.
This is a local implementation for review. No live database migration, push, merge, deployment, or Trello acceptance is included.

## Card coverage

| Card | Implemented locally | Remaining before Done |
| --- | --- | --- |
| #44 Assignment removal error | Reproduced the reported `Class_User` foreign-key failure on a populated disposable database. Migration changes two nullable legacy links to `ON DELETE SET NULL`, preserving the user, class membership, and other assignment. | Schema-owner review, approved live migration, then synthetic-account removal test. |
| #36 Calendar import or export | Added **Export month**. Downloads an `.ics` snapshot of unfinished assignments due in the displayed month and active study sessions overlapping it. Exports titles, class names, dates/times; excludes descriptions and grades. | Import a file in the team's calendar app and check dates/times; this is a snapshot, not synchronization or calendar import. |
| #42 Due-date limit | Maximum is one calendar year from today's Denver date, inclusive. Manual creation/edits validate it; pending database trigger also covers direct writes, AI confirmation, and MCP creation. Unchanged legacy dates remain editable without moving their stored time. | Apply approved trigger and repeat live boundary tests. |
| #41 Rapid tapping | Duplicate sign-in/sign-out, assignment saves, priority writes, and removal submits are guarded. Late results cannot populate a different signed-in account. Leaving Settings during a failed agent load no longer dereferences removed elements. | Repeat the original reviewer's rapid-tap scenario on a real phone; no claim that every unspecified crash has been reproduced. |
| #52 Completed view | Added **Completed** list tab and **Completed assignments** navigation destination. Shows completed tasks from every list and lets students uncheck them. Existing completed sections remain. | PO usability review. No separate 30-day archive policy added. |
| #53 Draft Assignments | Renamed destination; added Create draft and Save draft. Partial fields can be saved, resumed, updated without duplicates, and retained if creation fails. The November 16 integration preserves the team's database-backed drafts. | PO review and live save/reload checks; account persistence depends on the team's draft-table migration. |
| #38 Default sort order | Renamed Settings action and editor heading to **Default sort order**. Existing prioritization behavior is preserved. | PO wording review. |
| #47 Product name | Unchanged. | Brainstorm with Cameron, then obtain team choice before renaming. |

## Verification

- All 18 root CommonJS test suites passed, plus `test-chat-backend.mjs` with Node's type stripping.
- `test-sprint-backlog.cjs` executes the page's actual functions with controlled network/DOM adapters. Covers the calendar download Blob and month filtering, one-year/leap-day limits, preserved legacy instants, edited Denver dates, partial and escaped drafts, non-destructive resume, failed saves, duplicate writes/removals, late account results, and removed Settings DOM.
- Independently reran the full native PostgreSQL harness on loopback with populated synthetic accounts. Reproduced the original FK error, applied migrations in a disposable database, and passed owner-isolation, direct-access/delegated denials, revocation, retry/stale-update, concurrency, connection-limit, due-date, AI confirmation, and removal-preservation checks. Disposable database removed; local server stopped.
- Browser preview uses synthetic data and no Supabase connection. Checked Completed navigation and unchecking a task; partial draft creation, resume, and preserved empty date; the one-year date-picker maximum; renamed sort action and keyboard activation; calendar export feedback.
- Measured CSS viewports: **1367×767** (laptop) and **390×844** (phone); document width equaled viewport width. The viewport override is scaled by the host, so the laptop result is recorded at its measured size, not falsely labeled 1366×768.
- The browser's download-event listener timed out; a later direct export click produced the expected export feedback. File generation/download-link behavior is separately exercised in the executable test. Actual external-calendar import remains pending.
- Fixture screenshots use its existing fallback icons and are not a production icon audit. Settings persistence is not exercised by that fixture.
- Lighthouse accessibility, 200% browser zoom, live end-to-end acceptance, merge/deployment, and Nolan's PO approval remain **Not complete**. Cards should not be marked Done on this evidence alone.

## Screenshots

- [Laptop drafts](screenshots/backlog-20261112/drafts-laptop.png)
- [Laptop completed view](screenshots/backlog-20261112/completed-laptop.png)
- [Laptop calendar](screenshots/backlog-20261112/calendar-laptop.png)
- [Phone drafts](screenshots/backlog-20261112/drafts-phone.png)
- [Phone completed view](screenshots/backlog-20261112/completed-phone.png)
- [Phone calendar/export feedback](screenshots/backlog-20261112/calendar-phone.png)

## Cameron / PO acceptance checklist

1. Open Draft Assignments → Create draft. Enter a name, leave the class/date incomplete, and Save draft. Resume it and explicitly Save draft to update that same draft; Cancel should discard only unsaved edits. A failed Create must retain it; successful Create removes it from drafts. After the team's draft migration is applied, reload/sign-in should restore saved drafts.
2. Complete a task, open Completed assignments, then uncheck it. Confirm it returns to active work and keeps its list memberships.
3. Settings → Default sort order should open the same rule editor and still save rules normally.
4. Try a due date exactly one year ahead, then one day later. The boundary is accepted; the later date is rejected with a clear message. Editing an existing out-of-range date without changing it should preserve it.
5. Calendar → Export month, import the file into a calendar, and compare an assignment's all-day due date and a study session's local start/end. Move to another month and export again. Completed/no-date assignments and cancelled sessions should be absent. Export is a snapshot; re-export for later changes.
6. Rapidly click Create, completion, priority, Settings/navigation, and Remove on synthetic tasks. Verify no duplicates, crashes, or changes leaking after sign-out. Report any remaining crash with the exact sequence.
7. Have Nolan review the two migrations and the FK effects described in [database notes](backlog-database-20261112.md). Apply only in an approved rollout; verify synthetic removal preserves the user, class membership, and unrelated assignment. Complete the team's accessibility/live checks before acceptance.

## November 16 integration update

Reconciled with team main `49e34f0`, preserving database-backed drafts, draft priority selection, the 30-day completed archive, calendar priority markers, and current chat changes. The original November 12 session-only draft evidence and screenshots above are historical; the combined implementation now uses the team's saved-draft backend. Completed assignments remains an additional all-completed view. The pending local migrations were renumbered after current main, and a restrictive OAuth policy was added for the newly migrated draft table. These integration changes remain local and require the usual live release review.
