# Save confirmations

Local change on `codex/save-confirmations`, based on main `d5898484`.

## Behavior

- Successful rule saves show a persistent bordered **✓ Rule saved** notice directly above the action buttons. It remains in view while the rules scroll. Starting a new edit clears the previous success message.
- A pending rule save shows **Saving…**. Validation and save failures show their error instead of a success message; existing save locks and stale-session guards remain in place.
- Manual assignment creation shows **✓ Assignment saved** in a larger five-second status toast and **Assignment saved** in the page status. Exam names no longer overwrite this confirmation with a tip.
- AI assignment confirmation also reports **✓ Assignment saved** after its save/refresh completes, subject to the existing session/version checks.
- Completion, removal, and list-save messages use plain product language. Provider names were removed from page status, menu footer, and sign-in service errors. No database or API change.
- Toast and rule feedback use polite, atomic status announcements.

## Verification

Existing priority tests now assert pending versus confirmed feedback and clearing after a new edit. The existing chat-assignment test asserts the confirmation after successful creation. Existing failure/retry and stale-session tests remain in use.

Browser verification used `/layout-fixture` with simulated saves in memory, never the real database. A real manual creation path with an exam title displayed the correct success toast. Rule success remained beside the save controls, and adding another rule cleared it. `/layout-fixture?save=fail` produced rule and assignment errors without success feedback; the failed assignment form remained open.

The rule confirmation and action buttons fit at 390 x 844 with no horizontal overflow. Desktop was checked at the browser's native 1600 x 900 viewport. These checks verify presentation and simulated success/failure handling, not live backend persistence.

The layout review server now supports simulated save success/failure for these checks. Restart it with `node tools/layout-preview.cjs 4187` to use the updated fixture. Refresh resets the in-memory fixture. No production testing mode was added.

Screenshots:

- `save-feedback-screenshots/rule-saved-desktop.png`
- `save-feedback-screenshots/assignment-saved-desktop.png`
- `save-feedback-screenshots/rule-saved-phone.png`

Native screen-reader announcement behavior and live authenticated saves remain manual follow-up checks. Commit, PR, and deployment state are recorded in GitHub.
