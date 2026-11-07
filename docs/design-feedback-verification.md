# Graphic-design feedback implementation

November 6, 2026. Local preview only; not pushed, merged, or deployed.

## Changes

- A prominent heading identifies the assignment workspace. Main uses “Your upcoming assignments”; class and custom lists use their own headings. A short count distinguishes remaining and completed work.
- List tabs use restrained blue, amber, and purple accents while preserving the selected state and the existing font family.
- Priority badges use solid colored backgrounds with white text. The priority name and flag remain, so meaning does not depend on color alone.
- Only after a confirmed completion save, the task shows a green check and confirmation, then slides/fades downward before entering Completed. A ten-second status notice offers View, which scrolls to the completed task and focuses its checkbox.
- Reduced-motion preferences skip the animation. Keyboard focus returns to the next incomplete task after regrouping. Failed or stale-account saves do not show success.
- Chose the suggested page heading instead of adding a separate first-time onboarding flow. No database or API changes.

## Verification

- Browser checked with synthetic in-memory data at 390×844 CSS pixels and approximately 1366×768 (the browser reported 1367×767 due to viewport rounding). No page-level horizontal overflow.
- Visually inspected phone dark mode and laptop light mode, including long unbroken titles and many tabs. Default desktop dark mode was also inspected.
- Completed a task, used View, and verified its checked card appeared beneath Completed. A simulated failed save retained the unchecked task, displayed the error, and produced no green confirmation or success toast.
- Signed-out check confirmed the assignment heading and navigation remain hidden.
- `test-completion-feedback.cjs` verifies persistence precedes green feedback, the confirmation remains until the motion ends, failure preserves state, reduced motion skips animation, and account changes invalidate an outstanding response.
- Full local suite: 14 passed; the pre-existing `test-local-assignments.cjs` estimator mismatch (`75m` vs `90m`) remains. `git diff --check` passed.
- Live authenticated persistence was not repeated; these changes preserve the existing save adapter. Existing pending MCP work remains in this checkout.

## Screenshots

- [Laptop light mode](design-feedback-screenshots/assignments-laptop-light.png)
- [Phone dark mode](design-feedback-screenshots/assignments-phone.png)
- [Completed assignment on phone](design-feedback-screenshots/completed-phone.png)

Screenshots use synthetic assignments and the preview's existing local fallback icons.

Preview: `node tools/layout-preview.cjs 4194`, then open `http://127.0.0.1:4194/layout-fixture`. `/layout-fixture?save=fail` simulates a failed save. This fixture never contacts Supabase or an AI service.
# Pull-to-refresh and Add button follow-up (November 6)

- Refresh feedback now draws a circular arc proportional to the pull distance, completes it at the existing 64px release threshold, and spins a partial ring while the refresh is pending. Short/canceled pulls clear it; settled results stop the spinner. Reduced-motion preferences disable spinning.
- The main Add button uses a larger white SVG plus with thicker, rounded strokes; its accessible label, 44px target, and existing assignment creation action are preserved.
- `node test-pull-refresh.cjs` passed, including fractional progress, clamping, pulling back, cancellation, request locking, failure/retry, and swipe behavior. `node test-completion-feedback.cjs` passed. `git diff --check` passed.
- Synthetic browser preview checked at desktop and 390px phone width: mouse pull triggers refresh with a visible spinner; Add opens the existing assignment form; no browser console errors observed. Physical-device touch and authenticated server refresh were not retested.
- Evidence: `design-feedback-screenshots/refresh-laptop.png` and `design-feedback-screenshots/refresh-phone.png`. Preview still uses its existing fallback symbols for other icons.
- Local changes only; no push, merge, or deployment.
