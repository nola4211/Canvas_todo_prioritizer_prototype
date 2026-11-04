# Account controls and pull-down refresh

Local work on `codex/save-confirmations`, together with the save-feedback changes. Not committed or deployed.

- Removed the permanent status/reload/sign-out strip above assignments. Background sync status remains available to assistive technology; failures appear as a conditional alert.
- Sign out is available in Settings and Profile. Settings also has Reload assignments for mouse, keyboard, and trackpad users who prefer a button.
- At the top of Main, By Class, or a custom assignment list, pull downward and release after the “Release to refresh” cue. Supports touch pulls and mouse drags. Ordinary wheel scrolling is not treated as a refresh gesture.
- Reuses the existing authenticated assignment/list/priority loading flow, keeps the selected list when available, and announces refreshing, success, or failure. Concurrent saves/loads block another refresh.
- Horizontal swipes still change lists. Short/cancelled pulls, multi-touch, pulls starting below the top, and drags starting on interactive controls do not refresh.

Verification: an actual mouse drag on the local synthetic fixture displayed “Assignments refreshed”; the Settings reload button also worked. Profile sign-out returned to the login form and hid account controls. Automated gesture tests cover release threshold, pending-request exclusion, busy/scrolled/interactive exclusions, horizontal swipes, cancellation, multi-touch, mouse dragging, and recovery after a failed refresh.

Browser checks use the in-memory preview; they do not establish live backend persistence. No database schema/API changes. Screenshots are in `docs/refresh-screenshots/`.
