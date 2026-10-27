# Saved lists verification — October 27, 2026

## Database

Inspected the live `uowlwdwrqceklbqjcnmc` project before changes. Its seven public tables matched the repository's previous audit; `lists` and `list_assignments` were absent. Confirmed `assignments.assignment_id` is bigint and the two existing assignment policies still restrict access to the shared demo account and assignments 1–3.

Applied `supabase/migrations/202610270001_lists.sql`. Supabase returned “Success. No rows returned.” Existing assignment policies were preserved.

Ran the checks recorded in `docs/verify-lists.sql` against the live project. The result was PASS for list operations, name and membership uniqueness, invalid names, multiple-list membership, assignment preservation, other-identity isolation, and signed-out denial. Test inserts, updates, and deletes were rolled back.

## Browser

The user signed into the existing shared demo account in the local preview. No password was added to code or documentation.

Verified at `http://127.0.0.1:4183/`:

- Main and By Class loaded with the new saved Study list.
- Created This Week and added the synthetic IS401 Exam assignment.
- Renamed This Week to Weekly Plan, refreshed the whole page, and confirmed the new name and assignment connection survived.
- Added that same assignment to Study. Completing it in Study showed it completed in Weekly Plan too.
- Restored the assignment to incomplete and restored the list name to This Week.
- Removed the assignment from This Week; Study still contained it. Added it back to This Week.
- Main continued to show all three assignments.
- Refreshed again and confirmed This Week and its incomplete assignment loaded from Supabase.
- The final normal browser check returned no captured console errors or warnings.

The final shared demo has Study and This Week, both containing assignment 1. All three assignments remain incomplete.

## Local checks and limits

`node test.cjs` and `node test-lists.cjs` pass. The latter covers list operations, refresh-style reload, duplicate/invalid names, multiple membership, text escaping, failed requests retaining confirmed state, request locking, and clearing list state on sign-out.

List deletion was checked in the real database inside a rolled-back transaction and through the simulated UI handler. No persistent demo list was deleted in the browser. Network failures were simulated rather than tested by disconnecting the live browser. Cross-account isolation was tested using database roles and claims, not a second browser login. The new-account Study trigger is installed; a new Auth signup was not performed. A deployed GitHub Pages build has not been verified.
