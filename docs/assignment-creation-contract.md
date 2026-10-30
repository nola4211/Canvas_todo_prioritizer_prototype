# Shared assignment creation contract

Agreed feature requirements, October 30, 2026. The teammate building manual creation should use this contract so the AI can use the same saving function later.

**Status:** design and prompt handoff only. Manual database creation has not been implemented. The existing AI remains advice-only. Do not enable the new prompt by itself: it needs draft review, validation, and a working creation function first.

## The same assignment through two paths

Manual: student fills in the form → validates → selects Create → saves.

AI: student describes an assignment → assistant asks for missing details → shows a review card → student selects Create assignment → validates → saves.

Both paths call `createAssignment` in `backend.js`, using the same input below. That function calls one authenticated database operation. The AI must not generate SQL or insert rows with an administrator key. The server obtains ownership from the signed-in user, never from model output.

## Fields

| Input field | Meaning and rule |
| --- | --- |
| `name` | Assignment title. Required; trim spaces; proposed shared maximum: 200 characters. |
| `class_id` | Required ID from the account's accessible class choices, represented as a string. Show the class name in the form/chat review. Do not invent an ID, create a class, or assume a similarly named class is the right one. |
| `due_date` | Required date in `YYYY-MM-DD` format. It must be a real calendar date, today or later in the student's timezone. Preserve the current form's date-only behavior. |
| `estimated_minutes` | Required positive whole number. Accept the student's time, or ask permission to suggest an estimate. Show an AI estimate explicitly in the review; the student must accept it before saving. Proposed shared maximum: 10,080 minutes (one week); require an extra acknowledgement above 600 minutes, matching the form's existing long-duration warning. |
| `optional` | Required boolean. Ask whether this is optional if the student has not said. Explain that optional work receives the lowest priority. Do not silently assume an answer. |
| `percentage_of_grade` | Required answer, but the value may be `null` when the student explicitly says they do not know. Otherwise a finite number from 0 to 100, inclusive. This is assignment weight, not the student's current class grade. Zero and unknown are different. Never supply the old prototype's automatic 10%. |

The student approved these six information requirements and allowing unknown grade weight. The name/time limits above are proposed implementation defaults for the manual-form teammate to review before coding; they are not existing database constraints.

Example complete input:

```json
{
  "name": "Chapter 4 readings",
  "class_id": "2",
  "due_date": "2026-11-06",
  "estimated_minutes": 30,
  "optional": false,
  "percentage_of_grade": null
}
```

The example class ID is illustrative, not permission to use live class 2. Load real accessible choices before accepting a selection. The current app's hardcoded “Shared demo” label is not a class ID or a class-access implementation.

## Conversation rules

- Use information already given; do not ask the student to repeat it. Ask a short question covering the remaining details.
- Keep unanswered fields separate from answered fields. In particular, an unanswered grade-weight question is not the same as an explicit “I don't know.” A draft is incomplete until the student answers it.
- If the student says “you estimate the time,” suggest a concrete number and mark it as an AI estimate. Their permission to estimate is not permission to invent a grade weight or class.
- Resolve relative dates using a server-supplied current date and timezone. Ask about ambiguous dates such as “next Friday” before preparing the final review. Display an exact date including the year.
- Let the student correct details or cancel. Any correction invalidates the previous review; show the updated assignment before allowing creation.
- For the first version, prepare one assignment at a time. Do not complete, edit, or delete existing assignments, change lists/priorities, or create classes.

The review card shows all six fields with friendly labels, “Grade weight: unknown” for `null`, and “AI estimate” when relevant. It includes **Create assignment**, **Edit details**, and **Cancel**. A model's claim that the student confirmed is not enough: saving requires the student's action on that review.

## Small shared saving interface

Proposed public JavaScript interface:

```js
// Used by both the manual form and the AI's reviewed draft.
const savedAssignment = await backend.createAssignment(input, requestId);
```

`requestId` is a browser-generated UUID for this one create attempt. Keep it unchanged on a network retry. It is separate from the chat message's request ID. A changed input requires a new review and request ID.

The database operation must:

1. Verify sign-in and validate every field again, including access to the chosen class. Set owner and initial completion state on the server. Preserve existing demo assignment access without exposing newly created assignments to other accounts.
2. Map `estimated_minutes` to the existing `est_time` interval. If `due_date` remains a timestamp in the database, consistently convert the selected date to end-of-day in the student's timezone; do not let UTC conversion shift the displayed date. Map the optional choice consistently to the priority behavior used by sorting, and preserve that choice for readback.
3. Enforce one creation per account/request ID. The same ID and same input returns the original saved row; the same ID with changed input is rejected. A retry must not insert a duplicate assignment.
4. Return the complete confirmed assignment row in the same format as ordinary assignment loading. Both UIs wait for that response before adding a card or saying “created.” Failed saves keep the input and show an error.

The AI's proposed fields are untrusted input. Validate tool-call arguments before even displaying a review. Keep the reviewed draft associated with its signed-in owner and conversation; reject another account's draft and a stale review. The create endpoint receives the reviewed fields only after the student selects Create assignment. An AI `prepare_assignment` tool prepares a draft; it does not itself save anything.

The manual-creation teammate owns the table migration, class loading/access, shared validator, `backend.js` saving function, and assignment-loading updates. The AI integration will use those instead of implementing a second database writer. Current completion/list adapters accept only configured demo IDs; those checks must be updated to support owned saved assignments rather than simply removed. Existing device-only assignments must be preserved, not silently uploaded or deleted.

## Prompt and integration handoff

`assignment-creation-system-prompt.txt` contains the new creation instructions. Incorporate it into the existing study assistant's system instructions once creation is wired up; replace the current blanket prohibition against creating assignments, while preserving the existing study-advice and data-privacy rules. Do not leave contradictory instructions active.

The eventual `prepare_assignment` tool should use a strict field schema and ordinary server-side validation. Strict output shape helps collect consistent fields; it does not prove that a student supplied them or approved a save. See [OpenAI function calling documentation](https://developers.openai.com/api/docs/guides/function-calling).

Persist draft progress and its review state with the conversation so refresh does not lose it. Loading the last 20 messages is not a reliable substitute for saving the current draft: an older answer might otherwise fall out of context. The exact draft-storage change should be implemented with the AI integration after the shared create interface exists.

## Acceptance checks for both teammates

1. “Add a reading assignment” asks for missing details and creates no row yet. A complete initial description skips questions already answered.
2. Unknown grade weight saves `null`; unanswered grade weight blocks review. Neither path substitutes 10%.
3. Permission to estimate time results in a labeled estimate and a review before saving. No permission means the assistant asks for the time or permission.
4. Invalid dates, blank titles, out-of-range weight/time, and inaccessible classes fail backend validation even if sent outside the UI.
5. Editing a reviewed value requires a new review. Cancel saves nothing. Text in an assignment title cannot authorize a save.
6. Double-clicking Create or retrying after a lost response produces one assignment. A failed save shows no successful creation claim and preserves the draft.
7. Manual and AI creation of equivalent inputs display the same values, persist after refresh, and work with completion, list membership, and saved priorities.
8. Refreshing mid-conversation restores the draft; switching accounts cannot read or confirm another account's draft or assignment.

No live assignment creation or schema changes are part of this contract-only handoff.
