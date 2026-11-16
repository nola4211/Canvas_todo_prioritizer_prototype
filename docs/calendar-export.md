# Calendar export module

Load `calendar-export.js` in the browser and call `CanvasCalendarExport.build({ assignments, sessions, now })`. It returns a UTF-8 `.ics` string with CRLF line endings. The optional `now` argument makes `DTSTAMP` deterministic in tests.

Exported assignments are all-day events on their due date. Completed and no-due-date assignments are skipped. Active study sessions are timed events expressed as UTC instants; cancelled sessions are skipped. Event titles may include the class name. Descriptions, grades, and other assignment content are not exported.

In the app, **Export month** creates a snapshot of the currently displayed month: assignments due in that month and saved sessions that overlap it. The file is a one-time export, not a live calendar sync; export again to reflect later changes.

The module also runs in Node. Run `node test-calendar-export.cjs` to check its formatting, filtering, and input validation.
