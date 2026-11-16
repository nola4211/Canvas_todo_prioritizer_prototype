# AI assignment creation

The assistant collects a new assignment through conversation. It does not write an assignment when it generates a reply. It saves a draft and the app shows a review. Only the student's **Create assignment** action calls the database confirmation function.

## Using it

1. Open Assistant and start a conversation. For example, “Add a chapter reading assignment.”
2. Supply the assignment name, class name, and a priority: Low, Normal, High, or Urgent. These are the only three details required to create it.
3. Due date, time estimate, optional status, and grade weight may be supplied now or added later. You may explicitly allow the AI to estimate the time. Its suggestion is labeled **AI estimate** for review. Unknown or unanswered grade weight stays empty rather than becoming 0% or 10%.
4. Check the review, then select **Create assignment**, **Edit details**, or **Cancel draft**. A chat message saying “yes” does not create anything. Estimates over 10 hours need an additional checkbox acknowledgement.
5. After a confirmed save, the app reloads assignments. The saved task supports completion, list membership, priorities, and the assistant's normal task context.

While a reply is loading, only the thinking status appears; retry/failure controls are hidden. Actual request failures show a helpful message and a retry. Successful creation says “Assignment successfully saved!” without database terminology.

Drafts and their review state save to Supabase with the conversation and survive refresh. Every active AI draft is also mirrored into `assignments_draft`, so it appears in the app’s Drafts section and can be resumed there. Creating or cancelling it removes that Drafts copy. Starting another message invalidates the previous review while the reply is generated. Editing produces a new review/request ID. After a network error, reload/retry the same review instead of starting a duplicate.

The manual form uses the same rules and writer. Its class field now accepts a name and its grade-weight field supports an explicit unknown choice. The existing title-based time suggestion is labeled as a suggestion and fills an editable time input. Class names are labels for grouping; this does not create Canvas course connections or records in the existing Class table. Class grades remain unavailable.

## Files and database functions

- `assignment-fields.js`: plain JavaScript field validation used by the manual form and its backend adapter.
- `backend.js`: `createAssignment`, `loadAssignmentDraft`, `confirmAssignmentDraft`, and `changeAssignmentDraft` call Supabase. Existing assignment IDs, completion, and memberships still use the regular adapter.
- `chat.js`: displays the saved draft, review fields, confirmation controls, and errors. It renders student/model text with `textContent`.
- `supabase/functions/study-assistant/index.ts`: `assignmentInstructions` is the active system-prompt section. It sends a strict JSON response schema, validates the returned snapshot, and generates missing-field questions and review wording in code. It never invokes the assignment writer. `docs/assignment-creation-system-prompt.txt` is a readable copy.
- `assignments.class_name` stores the class label. Existing rows default to Shared demo; no existing assignment name, completion, or memberships are changed.
- `chat.assignment_draft` stores partial answers, explicit priority, whether weight was answered, estimate permission/source, review status, the Drafts-row ID, and a server-generated save request ID.
- `assignments_draft.source_chat_id` connects one Drafts-page row to its AI conversation. The database updates that row with each AI turn instead of creating duplicates.
- `create_saved_assignment`: shared manual/chat database writer. It validates sign-in and fields, derives ownership from Auth, converts Denver date to 11:59 pm correctly across daylight saving time, derives priority from optional status, and returns a confirmed row. Retrying the same request returns that row; changed input using that ID is rejected.
- `finish_ai_turn`: saves the assistant reply and its draft together. Only the service role can call it. Older calls without a draft remain compatible.
- `confirm_ai_assignment`: checks ownership, the exact current review ID, required name/class/priority, any optional values that were supplied, and long-estimate acknowledgement. Confirmation, Drafts cleanup, and the saved chat acknowledgement happen in one transaction. The browser cannot pass replacement assignment fields to this function.
- `change_ai_assignment_draft`: edits or cancels the account's current draft. A message trigger also invalidates a review before a new user question runs.

The system prompt guides extraction but is not a security boundary. Field types, ranges, ownership, current review identity, and duplicate prevention are enforced by code/database functions. The review lets the student check the model's interpretation of their words. A model can still misunderstand a class, title, date, or estimate; the review is required for that reason.

Required rules: title 1–200 characters, class 1–100, and priority 0–3 (Low through Urgent). When supplied, due date must be real and today or later in America/Denver, time must be 1–10,080 whole minutes, and grade weight must be 0–100 or unknown. The model does not choose owners, SQL, or completion state. It cannot edit/delete/complete existing assignments, create classes, or change lists/priorities.

## Deployment

Apply the original AI migrations in order, followed by `202611150001_assignment_drafts_table.sql` and `202611160001_ai_flexible_assignment_drafts.sql`. Apply each once. The flexible-drafts migration relaxes the final assignment requirement, connects AI drafts to the Drafts page, and keeps existing rows and ownership policies.

Deploy the updated `study-assistant/index.ts` in Supabase's function Code editor, keeping JWT verification enabled. No additional dependency files or new secrets are needed. The existing `OPENAI_API_KEY`, optional `OPENAI_MODEL`, and allowed origins remain in effect. Merge/deploy the frontend files together, including `assignment-fields.js` and the updated script versions in `index.html`.

Older frontend versions still use the original insertion path; they do not gain AI review controls until this frontend update is deployed. Existing device-only cards remain until explicitly imported. Import does not invent a grade weight; unavailable legacy weight is saved as unknown. Invalid or past-due legacy data stays on the device and shows an error rather than being silently changed.

## Checks

Run:

```
node test.cjs
node test-lists.cjs
node test-priorities.cjs
node test-assignment-create.cjs
node test-local-assignments.cjs
node test-chat.cjs
node test-chat-assignment.cjs
node test-chat-backend.mjs
```

Run `docs/verify-ai-assignment-creation.sql` in SQL Editor for actual database checks. It verifies shared creation, owner isolation, forged-review denial, confirmed retry identity, changed-input rejection, incomplete/stale review rejection, edit/cancel, invalid weight/time, and long-estimate acknowledgement. All its writes roll back.

In the browser, test an incomplete request, explicit unknown grade weight, refusal to guess time, permission to estimate, changing reviewed details, refresh during collection/review, cancellation, and confirmed creation. Check the saved row and request ID in Supabase, refresh again, and check lists/completion/priorities. A failed save must retain the review and must not show a success claim. See `docs/ai-assignment-creation-verification.md` for completed live checks.
