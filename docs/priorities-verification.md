# Saved priorities verification — October 28, 2026

## Live database

Confirmed access to the `uowlwdwrqceklbqjcnmc` project. Before changes, `user_priorities` was absent and `lists` contained only its original ID, owner, name, and creation timestamp. There were three assignments.

Applied `supabase/migrations/202610280001_priorities.sql`; Supabase returned “Success. No rows returned.” The migration adds priority columns, a small validation function, and the owner-protected `user_priorities` table. Existing assignment and list-ownership policies were preserved.

Executed `docs/verify-priorities.sql`. The result was PASS for saving and reading back priorities, scope separation, rule validation, list overrides, ownership protection, other-identity isolation, and signed-out denial. All verification writes were rolled back. That script tests the same upsert conflict target and columns as the browser adapter.

## Authenticated local browser

The user signed into the shared demo account at `http://127.0.0.1:4183/`. Credentials were not added to source or documentation.

Verified:

- Saved a settings title rule for `readings`.
- Created a separate Priority Demo list and added the three existing synthetic assignments.
- Saved a list rule for highest assignment percentage. With inheritance enabled, Readings remained first because the settings title rule won.
- Enabled Ignore settings priorities and saved. The order became Exam (25%), Project Draft (15%), Readings (5%).
- Refreshed the full page. The override checkbox, rules, and visible order persisted.
- Added due date as a second rule, moved it above percentage, and saved. The order became Exam (October 10), Readings (October 11), Project Draft (October 12).
- Changed the draft order and chose Cancel. Reopening the editor showed the previously saved due-first order.
- Restored percentage first and disabled the override. Readings moved first again under the persisted settings rule.
- Restored settings to no rules, refreshed, and confirmed the demo list still had percentage then due date, with inheritance enabled.
- Saved a separate Main title rule for `project`, refreshed, and confirmed Project Draft came before Exam in Main. Restored Main's rules to empty afterward.
- Captured no console errors or warnings during the final normal browser check.

## Final demo state and limits

Priority Demo remains as an example containing assignments 1–3, with percentage then due date and the override unchecked. Settings and Main have no rules. Study and its memberships were not changed. No assignment completion values were changed: Readings was already complete when testing began, and Exam and Project Draft were incomplete.

`node test.cjs`, `node test-lists.cjs`, and `node test-priorities.cjs` pass. Tests cover normal and overridden precedence, tie-breaking, literal case-insensitive title matching, missing data, validation, independent view scopes, saves/reload, request locking, failed requests, escaping, and stale-session results.

Network failures and stale-session cases were simulated. Account isolation was checked using database roles and claims rather than a second browser login. By Class scope storage was database-tested; it uses the same editor as Main. Grade in class is intentionally unavailable until Canvas supplies it. The new frontend has not yet been deployed or tested on GitHub Pages.

An additional browser invalid-title submission was not run: automatic approval review flagged a risk of saving an unintended demo rule. The saved configuration was then reloaded and confirmed unchanged. Invalid rules were tested successfully in the automated suite and rollback-only SQL checks.
