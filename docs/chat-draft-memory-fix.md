# Keep answers across assignment-chat turns

The assistant previously replaced the saved assignment draft with every model response. A model response containing null for an earlier answer erased that answer, so a short follow-up such as “you can est the time” could reset the whole draft.

`mergeDraftUpdates` now combines the new response with the active saved draft before validation. Null/omitted answers preserve previously supplied name, class, date, optional choice, grade weight, and time details. Time and its source stay together; previously granted estimate permission is retained. Valid corrections replace earlier values, including changing a known grade weight to explicit unknown. `clear_fields` is a separate, explicit model action for a student requesting removal of an answer or withdrawing estimate permission. Finished or cancelled drafts do not supply defaults for a new assignment.

The prompt also explains permission-only replies, and when only optional status is missing the response is simply: “Is this assignment optional, or required?”

Run `node test-chat-backend.mjs`. The regression follows the reported sequence through an empty draft, “test 1,” class/date/35% weight, estimate permission, then optional=false. It verifies retained answers, no premature creation, corrections, explicit unknown/zero grade weight, explicit clearing, finished-draft isolation, and the merged data sent to the database finalizer.

This is an Edge Function change; no database migration or frontend update is required. Deploy `supabase/functions/study-assistant/index.ts` using the existing function Code editor, retaining JWT verification. The prompt text file is a readable copy, not a runtime dependency.

Live verification on October 30, 2026: deployed the updated Edge Function and replayed the user's four messages verbatim in a new signed-in chat. After “you can est the time,” the saved draft retained test 1, class test, October 31 (tomorrow), and 35%; it added a labeled 60-minute AI estimate and asked only whether the task was optional or required. No assignment was created during this test. The backend regression suite passed, including explicit clearing and withdrawing estimate permission. The live fix does not depend on a frontend deployment; merge the source change before a later redeployment of the function.
